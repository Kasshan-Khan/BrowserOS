import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { destroyAllSessions } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { passwordResetRequestSchema, passwordResetSchema } from '@/lib/validations/auth';
import { audit } from '@/lib/audit';
import { ok, badRequest, tooManyRequests, handleApiError, getClientIp } from '@/lib/api';
import { randomBytes } from 'crypto';
import { addHours } from 'date-fns';

// POST /api/auth/reset-password — Request a reset token
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) return tooManyRequests();

  try {
    const body = await request.json();

    // Check if it's a request or a reset
    if ('token' in body) {
      // Complete reset
      const input = passwordResetSchema.parse(body);

      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token: input.token },
        include: { user: true },
      });

      if (
        !resetToken ||
        resetToken.usedAt ||
        resetToken.expiresAt < new Date()
      ) {
        return badRequest('Invalid or expired reset token');
      }

      const passwordHash = await hashPassword(input.password);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      // Invalidate all sessions (security)
      await destroyAllSessions(resetToken.userId);

      await audit({
        userId: resetToken.userId,
        action: 'AUTH_PASSWORD_RESET_COMPLETE',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });

      return ok({ message: 'Password reset successfully. Please log in.' });
    } else {
      // Request token
      const input = passwordResetRequestSchema.parse(body);

      const user = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });

      // Always return success to prevent email enumeration
      if (user) {
        const token = randomBytes(32).toString('hex');
        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            token,
            expiresAt: addHours(new Date(), 1),
          },
        });

        // In production, send email with reset link
        // For now, log it (replace with email service)
        console.log(`[Password Reset] Token for ${input.email}: ${token}`);

        await audit({
          userId: user.id,
          action: 'AUTH_PASSWORD_RESET_REQUEST',
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') ?? undefined,
        });
      }

      return ok({
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
