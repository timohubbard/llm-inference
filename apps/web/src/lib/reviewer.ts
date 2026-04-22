import { Redis } from "@upstash/redis";
import { auth, clerkClient } from "@clerk/nextjs/server";

const REVIEWER_FLAG = "reviewerMode";
const SESSION_ID_KEY = "reviewerSessionId";

export class ReviewerBudgetExhausted extends Error {
  constructor(public readonly spentUsd: number, public readonly capUsd: number) {
    super(`Reviewer spend cap reached ($${spentUsd.toFixed(2)} / $${capUsd.toFixed(2)}).`);
    this.name = "ReviewerBudgetExhausted";
  }
}

let redisCache: Redis | null = null;
function getRedis(): Redis | null {
  if (redisCache) return redisCache;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisCache = new Redis({ url, token });
  return redisCache;
}

export function reviewerConfig() {
  return {
    password: process.env.REVIEWER_PASSWORD ?? "",
    apiKey: process.env.REVIEWER_ANTHROPIC_KEY ?? "",
    capUsd: Number(process.env.REVIEWER_SPEND_CAP_USD ?? "2"),
    ttlSeconds: Number(process.env.REVIEWER_SESSION_TTL_DAYS ?? "7") * 24 * 60 * 60,
  };
}

export async function startReviewerSession(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { [REVIEWER_FLAG]: true, [SESSION_ID_KEY]: sessionId },
  });
  const redis = getRedis();
  if (redis) {
    await redis.set(`reviewer:${sessionId}:spent_cents`, 0, {
      ex: reviewerConfig().ttlSeconds,
    });
  }
  return sessionId;
}

export async function endReviewerSession(userId: string): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { [REVIEWER_FLAG]: false, [SESSION_ID_KEY]: null },
  });
}

export async function currentReviewerSession(): Promise<
  | { active: false }
  | { active: true; sessionId: string; spentUsd: number; capUsd: number }
> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return { active: false };
  const meta = (sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
  if (!meta[REVIEWER_FLAG] || typeof meta[SESSION_ID_KEY] !== "string") {
    return { active: false };
  }
  const sessionId = meta[SESSION_ID_KEY];
  const cap = reviewerConfig().capUsd;
  const redis = getRedis();
  const cents = redis
    ? Number((await redis.get<number>(`reviewer:${sessionId}:spent_cents`)) ?? 0)
    : 0;
  return { active: true, sessionId, spentUsd: cents / 100, capUsd: cap };
}

export async function reserveReviewerSpend(sessionId: string, estCostUsd: number): Promise<void> {
  const redis = getRedis();
  const cap = reviewerConfig().capUsd;
  if (!redis) {
    throw new Error("Upstash Redis is not configured; reviewer flow requires it.");
  }
  const cents = Math.ceil(estCostUsd * 100);
  const key = `reviewer:${sessionId}:spent_cents`;
  const newTotal = (await redis.incrby(key, cents)) as number;
  if (newTotal > cap * 100) {
    await redis.decrby(key, cents);
    throw new ReviewerBudgetExhausted(newTotal / 100, cap);
  }
}
