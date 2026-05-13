import 'server-only';
import { cookies } from 'next/headers';
import { redis, RedisKeys, TTL } from '@/lib/redis';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import type { SessionPayload } from '@/types/auth';
import { SESSION_COOKIE } from '@/lib/auth/constants';

export { type SessionPayload } from '@/types/auth';
export { SESSION_COOKIE } from '@/lib/auth/constants';

// ─── Create a new session ─────────────────────────────────────────────────────

export async function createSession(
  user: Pick<User, 'id' | 'email' | 'username' | 'displayName' | 'role' | 'avatarUrl'>,
  request?: { ip?: string; userAgent?: string }
): Promise<string> {
  const token = randomBytes(32).toString('hex');

  const expiresAt = new Date(Date.now() + TTL.SESSION * 1000);

  // Persist session to DB for multi-device management
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token,
      userAgent: request?.userAgent,
      ipAddress: request?.ip,
      expiresAt,
    },
  });

  const payload: SessionPayload = {
    userId: user.id,
    sessionId: session.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };

  // Cache in Redis for fast lookup
  await redis.setex(
    RedisKeys.session(token),
    TTL.SESSION,
    JSON.stringify(payload)
  );

  // Track session IDs per user for "logout all devices"
  await redis.sadd(RedisKeys.sessionsByUser(user.id), token);
  await redis.expire(RedisKeys.sessionsByUser(user.id), TTL.SESSION);

  return token;
}

// ─── Get current session from request ────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  // Fast path: Redis cache
  const cached = await redis.get(RedisKeys.session(token));
  if (cached) {
    // Extend TTL on activity (sliding window)
    await redis.expire(RedisKeys.session(token), TTL.SESSION);
    return JSON.parse(cached) as SessionPayload;
  }

  // Slow path: DB lookup (e.g., after Redis flush)
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }

  // Re-hydrate Redis cache
  const payload: SessionPayload = {
    userId: session.user.id,
    sessionId: session.id,
    email: session.user.email,
    username: session.user.username,
    displayName: session.user.displayName,
    role: session.user.role,
    avatarUrl: session.user.avatarUrl,
  };

  await redis.setex(
    RedisKeys.session(token),
    TTL.SESSION,
    JSON.stringify(payload)
  );

  return payload;
}

// ─── Set session cookie ───────────────────────────────────────────────────────

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL.SESSION,
    path: '/',
  });
}

// ─── Destroy session ──────────────────────────────────────────────────────────

export async function destroySession(token: string): Promise<void> {
  // Get userId before deleting (for cleanup)
  const cached = await redis.get(RedisKeys.session(token));
  if (cached) {
    const payload = JSON.parse(cached) as SessionPayload;
    await redis.srem(RedisKeys.sessionsByUser(payload.userId), token);
  }

  await redis.del(RedisKeys.session(token));
  await prisma.session.deleteMany({ where: { token } });
}

// ─── Destroy all sessions for a user ─────────────────────────────────────────

export async function destroyAllSessions(userId: string): Promise<void> {
  const tokens = await redis.smembers(RedisKeys.sessionsByUser(userId));

  const pipeline = redis.pipeline();
  for (const token of tokens) {
    pipeline.del(RedisKeys.session(token));
  }
  pipeline.del(RedisKeys.sessionsByUser(userId));
  await pipeline.exec();

  await prisma.session.deleteMany({ where: { userId } });
}

// ─── Clear session cookie ─────────────────────────────────────────────────────

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
