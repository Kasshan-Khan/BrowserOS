import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, clearSessionCookie, SESSION_COOKIE } from '@/lib/auth/session';
import { getSession } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { ok, handleApiError, getClientIp } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = await getSession();

    if (token) {
      await destroySession(token);
    }

    await clearSessionCookie();

    if (session) {
      await audit({
        userId: session.userId,
        action: 'AUTH_LOGOUT',
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    return ok({ message: 'Logged out successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
