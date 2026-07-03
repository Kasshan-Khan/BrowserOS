import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitToUser, getIO, Rooms } from '@/lib/socket/server';
import { z } from 'zod';

const statusSchema = z.object({
  status: z.enum(['ONLINE', 'AWAY', 'DO_NOT_DISTURB', 'INVISIBLE']).optional(),
  statusText: z.string().max(128).optional(),
  currentApp: z.string().max(64).optional().nullable(),
});

// GET /api/social/status?userId=xxx — Get a user's status
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true, statusText: true, currentApp: true },
      });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      return NextResponse.json({ status: user });
    }

    // Return own status
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, status: true, statusText: true, currentApp: true },
    });
    return NextResponse.json({ status: user });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

// PUT /api/social/status — Update own status
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const data = statusSchema.parse(body);

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.statusText !== undefined && { statusText: data.statusText }),
        ...(data.currentApp !== undefined && { currentApp: data.currentApp }),
      },
      select: { id: true, status: true, statusText: true, currentApp: true },
    });

    // Broadcast status change to all friends
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userId: session.userId }, { friendId: session.userId }],
      },
    });

    const friendIds = friendships.map((f) =>
      f.userId === session.userId ? f.friendId : f.userId
    );

    for (const friendId of friendIds) {
      emitToUser(friendId, 'presence:status_changed', {
        userId: session.userId,
        status: updated.status,
        statusText: updated.statusText,
        currentApp: updated.currentApp,
      });
    }

    return NextResponse.json({ status: updated });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
