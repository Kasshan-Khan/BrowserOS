import 'server-only';
import { Redis } from 'ioredis';

// Prevent multiple instances in development hot-reload
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisPub: Redis | undefined;
  redisSub: Redis | undefined;
};

function createRedisClient(name: string): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 5) {
        console.error(`[Redis:${name}] Max retries reached`);
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  });

  client.on('connect', () => console.log(`[Redis:${name}] Connected`));
  client.on('error', (err) => console.error(`[Redis:${name}] Error:`, err));

  return client;
}

// Main client for general use
export const redis =
  globalForRedis.redis ?? createRedisClient('main');

// Dedicated pub/sub clients (cannot share with regular commands)
export const redisPub =
  globalForRedis.redisPub ?? createRedisClient('pub');

export const redisSub =
  globalForRedis.redisSub ?? createRedisClient('sub');

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
  globalForRedis.redisPub = redisPub;
  globalForRedis.redisSub = redisSub;
}

// ─── Key builders ────────────────────────────────────────────────────────────

export const RedisKeys = {
  session: (token: string) => `session:${token}`,
  sessionsByUser: (userId: string) => `user_sessions:${userId}`,
  rateLimitAuth: (ip: string) => `rate_limit:auth:${ip}`,
  resetToken: (token: string) => `reset_token:${token}`,
  csrfToken: (sessionId: string) => `csrf:${sessionId}`,
} as const;

// ─── TTL constants (seconds) ─────────────────────────────────────────────────

export const TTL = {
  SESSION: parseInt(process.env.SESSION_MAX_AGE ?? '604800'),  // 7d
  RESET_TOKEN: 3600,   // 1h
  CSRF_TOKEN: 86400,   // 24h
  RATE_LIMIT: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW ?? '900'), // 15m
} as const;
