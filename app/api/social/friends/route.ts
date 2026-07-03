import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitMessengerEvent, Events } from '@/lib/socket/server';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch friendships where user is either initiator or recipient
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId: session.userId },
          { friendId: session.userId },
        ],
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true },
        },
        friend: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ friendships });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch friends' }, { status: 500 });
  }
}

const sendRequestSchema = z.object({
  username: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { username } = sendRequestSchema.parse(body);

    if (username === session.username) {
      return NextResponse.json({ error: 'Cannot add yourself as a friend' }, { status: 400 });
    }

    // Find target user
    const targetUser = await prisma.user.findUnique({
      where: { username },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if friendship already exists (in either direction)
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: session.userId, friendId: targetUser.id },
          { userId: targetUser.id, friendId: session.userId },
        ],
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Friendship or request already exists' }, { status: 400 });
    }

    // Create pending request
    const friendship = await prisma.friendship.create({
      data: {
        userId: session.userId,
        friendId: targetUser.id,
        status: 'PENDING',
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true },
        },
        friend: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true },
        },
      },
    });

    // Emit event to target user
    emitMessengerEvent(targetUser.id, Events.MESSENGER_FRIEND_REQUEST, { friendship });

    return NextResponse.json({ friendship }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to send request' }, { status: 500 });
  }
}

const updateRequestSchema = z.object({
  friendshipId: z.string().min(1),
  action: z.enum(['ACCEPT', 'REJECT']),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { friendshipId, action } = updateRequestSchema.parse(body);

    // Find the friendship
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Friendship not found' }, { status: 404 });
    }

    // Only the recipient can accept/reject
    if (friendship.friendId !== session.userId) {
      return NextResponse.json({ error: 'Unauthorized to update this request' }, { status: 403 });
    }

    if (friendship.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request is already processed' }, { status: 400 });
    }

    if (action === 'REJECT') {
      // We can just delete the friendship or mark it rejected.
      // Deleting is usually cleaner so they can try again in the future if needed,
      // but marking REJECTED works too. We'll delete to keep the DB clean.
      await prisma.friendship.delete({
        where: { id: friendshipId },
      });
      return NextResponse.json({ success: true, deleted: true });
    }

    // ACCEPT
    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true } },
        friend: { select: { id: true, username: true, displayName: true, avatarUrl: true, isActive: true } },
      },
    });

    // Notify the original sender that it was accepted
    emitMessengerEvent(updated.userId, Events.MESSENGER_FRIEND_REQUEST, { friendship: updated });

    return NextResponse.json({ friendship: updated });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }
}
