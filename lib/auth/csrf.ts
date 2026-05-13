import { randomBytes, createHmac } from 'crypto';
import { redis, RedisKeys, TTL } from '@/lib/redis';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = '__bos_csrf';

// ─── Generate CSRF token ──────────────────────────────────────────────────────

export async function generateCsrfToken(sessionId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');

  // Sign with secret to prevent forgery
  const signed = signToken(token);

  await redis.setex(
    RedisKeys.csrfToken(sessionId),
    TTL.CSRF_TOKEN,
    signed
  );

  return signed;
}

// ─── Validate CSRF token ──────────────────────────────────────────────────────

export async function validateCsrfToken(
  sessionId: string,
  requestToken: string
): Promise<boolean> {
  const storedToken = await redis.get(RedisKeys.csrfToken(sessionId));
  if (!storedToken) return false;

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(storedToken, requestToken);
}

// ─── Extract CSRF token from request ─────────────────────────────────────────

export function getCsrfTokenFromRequest(request: Request): string | null {
  return request.headers.get(CSRF_HEADER);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signToken(token: string): string {
  const secret = process.env.CSRF_SECRET!;
  const hmac = createHmac('sha256', secret);
  hmac.update(token);
  const signature = hmac.digest('hex');
  return `${token}.${signature}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export { CSRF_HEADER, CSRF_COOKIE };
