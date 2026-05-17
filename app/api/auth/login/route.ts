import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { loginSchema } from '@/lib/validations/auth';
import { audit } from '@/lib/audit';
import { ok, badRequest, unauthorized, tooManyRequests, handleApiError, getClientIp } from '@/lib/api';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return tooManyRequests('Too many login attempts. Please try again later.');
  }

  try {
    const body = await request.json();
    const input = loginSchema.parse(body);

    // Find user — use constant-time response to prevent enumeration
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    // Always run password verification even if user not found (timing attack prevention)
    const DUMMY_HASH =
      '$argon2id$v=19$m=65536,t=3,p=4$dummysaltdummysalt$dummyhashvaluedummyhashvalue';

    const isValid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyPassword(DUMMY_HASH, input.password).then(() => false);

    if (!user || !isValid) {
      await audit({
        action: 'AUTH_LOGIN',
        metadata: { email: input.email, success: false },
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
      return unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      return unauthorized('Your account has been suspended. Please contact support.');
    }

    // Create session
    const token = await createSession(user, {
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    await setSessionCookie(token);

    await audit({
      userId: user.id,
      action: 'AUTH_LOGIN',
      metadata: { success: true },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
