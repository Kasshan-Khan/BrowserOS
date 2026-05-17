import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkRateLimit, rateLimitHeaders } from '@/lib/auth/rate-limit';
import { signupSchema } from '@/lib/validations/auth';
import { audit } from '@/lib/audit';
import { bootstrapUserHomeDirectory } from '@/lib/vfs';
import { ok, badRequest, tooManyRequests, handleApiError, getClientIp } from '@/lib/api';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limiting
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return tooManyRequests('Too many signup attempts. Please try again later.');
  }

  try {
    const body = await request.json();
    const input = signupSchema.parse(body);

    // Check for existing user
    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingEmail) {
      return badRequest('An account with this email already exists');
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (existingUsername) {
      return badRequest('This username is already taken');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        passwordHash,
      },
    });

    // Bootstrap home directory
    await bootstrapUserHomeDirectory(user.id);

    // Create session
    const token = await createSession(user, {
      ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    // Set cookie
    await setSessionCookie(token);

    // Audit
    await audit({
      userId: user.id,
      action: 'AUTH_SIGNUP',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return ok(
      {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
