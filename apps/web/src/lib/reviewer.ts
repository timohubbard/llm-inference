import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";

const COOKIE_NAME = "reviewer_sid";

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

export type ReviewerProviderId = "anthropic" | "openai" | "google";

export function reviewerConfig() {
  const apiKeys: Record<ReviewerProviderId, string> = {
    anthropic: process.env.REVIEWER_ANTHROPIC_KEY ?? "",
    openai: process.env.REVIEWER_OPENAI_KEY ?? "",
    google: process.env.REVIEWER_GOOGLE_KEY ?? "",
  };
  return {
    password: process.env.REVIEWER_PASSWORD ?? "",
    apiKeys,
    availableProviders: (Object.keys(apiKeys) as ReviewerProviderId[]).filter((p) => apiKeys[p]),
    capUsd: Number(process.env.REVIEWER_SPEND_CAP_USD ?? "2"),
    ttlSeconds: Number(process.env.REVIEWER_SESSION_TTL_DAYS ?? "7") * 24 * 60 * 60,
  };
}

export function getReviewerKey(provider: ReviewerProviderId): string | null {
  const key = reviewerConfig().apiKeys[provider];
  return key || null;
}

export async function startReviewerSession(): Promise<string> {
  const sessionId = crypto.randomUUID();
  const cfg = reviewerConfig();
  const redis = getRedis();
  if (redis) {
    await redis.set(`reviewer:${sessionId}:meta`, { createdAt: Date.now() }, {
      ex: cfg.ttlSeconds,
    });
    await redis.set(`reviewer:${sessionId}:spent_cents`, 0, {
      ex: cfg.ttlSeconds,
    });
  }
  const jar = await cookies();
  jar.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cfg.ttlSeconds,
  });
  return sessionId;
}

export async function endReviewerSession(): Promise<void> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) {
    const redis = getRedis();
    if (redis) {
      await redis.del(`reviewer:${existing}:meta`);
      await redis.del(`reviewer:${existing}:spent_cents`);
    }
    jar.delete(COOKIE_NAME);
  }
}

export async function currentReviewerSession(): Promise<
  | { active: false }
  | {
      active: true;
      sessionId: string;
      spentUsd: number;
      capUsd: number;
      availableProviders: ReviewerProviderId[];
    }
> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE_NAME)?.value;
  if (!sessionId) return { active: false };
  const cfg = reviewerConfig();
  const redis = getRedis();
  if (!redis) {
    return {
      active: true,
      sessionId,
      spentUsd: 0,
      capUsd: cfg.capUsd,
      availableProviders: cfg.availableProviders,
    };
  }
  const meta = await redis.get(`reviewer:${sessionId}:meta`);
  if (!meta) return { active: false };
  const cents = Number((await redis.get<number>(`reviewer:${sessionId}:spent_cents`)) ?? 0);
  return {
    active: true,
    sessionId,
    spentUsd: cents / 100,
    capUsd: cfg.capUsd,
    availableProviders: cfg.availableProviders,
  };
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
