import { NextRequest } from 'next/server';
import { getSession, destroyAllSessions, clearSessionCookie } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { ok, unauthorized, handleApiError, getClientIp } from '@/lib/api';

// GET /api/auth/sessions — List all active sessions
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId: session.userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return ok({ sessions, currentSessionId: session.sessionId });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/auth/sessions — Logout all other devices
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    await destroyAllSessions(session.userId);
    await clearSessionCookie();

    await audit({
      userId: session.userId,
      action: 'AUTH_LOGOUT',
      metadata: { allDevices: true },
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return ok({ message: 'All sessions revoked' });
  } catch (error) {
    return handleApiError(error);
  }
}
