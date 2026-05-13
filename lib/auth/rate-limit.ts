import { redis, RedisKeys, TTL } from '@/lib/redis';

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '10');
const WINDOW_SECONDS = TTL.RATE_LIMIT;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ─── Sliding window rate limiter ──────────────────────────────────────────────

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const key = RedisKeys.rateLimitAuth(ip);
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  const pipeline = redis.pipeline();

  // Remove requests outside current window
  pipeline.zremrangebyscore(key, '-inf', windowStart);
  // Count remaining requests in window
  pipeline.zcard(key);
  // Add current request timestamp
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  // Set expiry
  pipeline.expire(key, WINDOW_SECONDS);

  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) ?? 0;

  const allowed = count < MAX_REQUESTS;
  const remaining = Math.max(0, MAX_REQUESTS - count - 1);
  const resetAt = Math.floor((now + WINDOW_SECONDS * 1000) / 1000);

  return { allowed, remaining, resetAt };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(MAX_REQUESTS),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
  };
}
