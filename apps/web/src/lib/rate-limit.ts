import { Redis } from "@upstash/redis";

let redisCache: Redis | null = null;
function getRedis(): Redis | null {
  if (redisCache) return redisCache;
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  if (!url || !token) return null;
  redisCache = new Redis({ url, token });
  return redisCache;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Fixed-window counter keyed by `bucket:identifier`. The first hit pins a TTL
 * equal to the window. Subsequent hits within the window increment; once the
 * counter exceeds `limit`, returns allowed=false.
 *
 * If Redis isn't configured, this fails OPEN (returns allowed=true) — better
 * UX than locking everyone out, and the password is still required.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }
  const key = `ratelimit:${bucket}:${identifier}`;
  const count = (await redis.incr(key)) as number;
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  const ttl = (await redis.ttl(key)) as number;
  const resetSeconds = ttl > 0 ? ttl : windowSeconds;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetSeconds,
  };
}

/**
 * Best-effort client IP extraction from Vercel-style headers. Falls back to
 * "unknown" if no proxy header is present (e.g., direct dev requests).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
