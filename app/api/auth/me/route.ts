import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { ok, unauthorized, handleApiError } from '@/lib/api';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) return unauthorized();

    return ok({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
