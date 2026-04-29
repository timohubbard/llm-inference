import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";

const COOKIE_NAME = "reviewer_sid";

// Two-day TTL on daily-budget keys gives a comfortable read window across the
// UTC midnight rollover so we never look up a key that's expired between the
// cap check and the response.
const DAILY_BUDGET_TTL_SECONDS = 60 * 60 * 48;

export class ReviewerBudgetExhausted extends Error {
  constructor(
    public readonly spentUsd: number,
    public readonly capUsd: number,
    public readonly scope: "session" | "daily" = "session",
  ) {
    super(
      scope === "daily"
        ? `Deployment-wide reviewer budget for today reached ($${spentUsd.toFixed(2)} / $${capUsd.toFixed(2)} USD). The daily budget refreshes at UTC midnight.`
        : `Per-session reviewer spend cap reached ($${spentUsd.toFixed(2)} / $${capUsd.toFixed(2)}).`,
    );
    this.name = "ReviewerBudgetExhausted";
  }
}

let redisCache: Redis | null = null;
function getRedis(): Redis | null {
  if (redisCache) return redisCache;
  // Accept either the legacy Upstash names or the names Vercel's Marketplace
  // integration injects (KV_REST_API_URL / KV_REST_API_TOKEN — backed by
  // Upstash under the hood).
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
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
    dailyBudgetUsd: Number(process.env.REVIEWER_DAILY_BUDGET_USD ?? "20"),
    ttlSeconds: Number(process.env.REVIEWER_SESSION_TTL_DAYS ?? "7") * 24 * 60 * 60,
  };
}

export function getReviewerKey(provider: ReviewerProviderId): string | null {
  const key = reviewerConfig().apiKeys[provider];
  return key || null;
}

function utcDateKey(): string {
  // YYYY-MM-DD in UTC; budget rolls over at UTC midnight.
  return new Date().toISOString().slice(0, 10);
}

function dailyBudgetKey(): string {
  return `reviewer:daily:${utcDateKey()}:spent_cents`;
}

export async function startReviewerSession(): Promise<string> {
  const sessionId = crypto.randomUUID();
  const cfg = reviewerConfig();
  const redis = getRedis();
  if (!redis) {
    throw new Error(
      "Upstash Redis is not configured on this deployment, but the reviewer spend cap requires it. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN) — free tier via the Vercel Marketplace → Upstash integration.",
    );
  }
  await redis.set(`reviewer:${sessionId}:meta`, { createdAt: Date.now() }, {
    ex: cfg.ttlSeconds,
  });
  await redis.set(`reviewer:${sessionId}:spent_cents`, 0, {
    ex: cfg.ttlSeconds,
  });
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

export interface ActiveReviewerSession {
  active: true;
  sessionId: string;
  spentUsd: number;
  capUsd: number;
  dailySpentUsd: number;
  dailyCapUsd: number;
  availableProviders: ReviewerProviderId[];
}

export type ReviewerSessionState = { active: false } | ActiveReviewerSession;

export async function currentReviewerSession(): Promise<ReviewerSessionState> {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE_NAME)?.value;
  if (!sessionId) return { active: false };
  const cfg = reviewerConfig();
  const redis = getRedis();
  if (!redis) {
    // No Redis = no spend tracking, so a "session" cookie alone isn't enough
    // to grant access. The activate-route would have refused to set the
    // cookie in the first place; if one is present, treat it as stale.
    return { active: false };
  }
  const meta = await redis.get(`reviewer:${sessionId}:meta`);
  if (!meta) return { active: false };
  const sessionCents = Number(
    (await redis.get<number>(`reviewer:${sessionId}:spent_cents`)) ?? 0,
  );
  const dailyCents = Number((await redis.get<number>(dailyBudgetKey())) ?? 0);
  return {
    active: true,
    sessionId,
    spentUsd: sessionCents / 100,
    capUsd: cfg.capUsd,
    dailySpentUsd: dailyCents / 100,
    dailyCapUsd: cfg.dailyBudgetUsd,
    availableProviders: cfg.availableProviders,
  };
}

/**
 * Reserve `estCostUsd` against BOTH the per-session cap and the deployment-wide
 * daily budget. If either would be exceeded, the increments are rolled back
 * and a ReviewerBudgetExhausted is thrown identifying which scope tripped.
 */
export async function reserveReviewerSpend(sessionId: string, estCostUsd: number): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Upstash Redis is not configured; reviewer flow requires it.");
  }
  const cfg = reviewerConfig();
  const cents = Math.ceil(estCostUsd * 100);
  const sessionKey = `reviewer:${sessionId}:spent_cents`;
  const dailyKey = dailyBudgetKey();

  const newSession = (await redis.incrby(sessionKey, cents)) as number;
  if (newSession > cfg.capUsd * 100) {
    await redis.decrby(sessionKey, cents);
    throw new ReviewerBudgetExhausted(newSession / 100, cfg.capUsd, "session");
  }

  const newDaily = (await redis.incrby(dailyKey, cents)) as number;
  // Daily key has no expiry by default; pin a TTL on first write.
  if (newDaily === cents) {
    await redis.expire(dailyKey, DAILY_BUDGET_TTL_SECONDS);
  }
  if (newDaily > cfg.dailyBudgetUsd * 100) {
    await redis.decrby(sessionKey, cents);
    await redis.decrby(dailyKey, cents);
    throw new ReviewerBudgetExhausted(newDaily / 100, cfg.dailyBudgetUsd, "daily");
  }
}

/**
 * Refund a previously-reserved amount on both scopes. Call this when the
 * actual LLM call failed after the reservation succeeded — reviewers
 * shouldn't pay budget for our errors.
 */
export async function refundReviewerSpend(sessionId: string, estCostUsd: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // best-effort
  const cents = Math.ceil(estCostUsd * 100);
  await redis.decrby(`reviewer:${sessionId}:spent_cents`, cents);
  await redis.decrby(dailyBudgetKey(), cents);
}
