import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitMessengerEvent, Events } from '@/lib/socket/server';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const friendId = searchParams.get('friendId');

    if (!friendId) {
      return NextResponse.json({ error: 'Missing friendId' }, { status: 400 });
    }

    // Verify they are actually friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: session.userId, friendId },
          { userId: friendId, friendId: session.userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Not friends' }, { status: 403 });
    }

    // Fetch messages between these two users
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: session.userId, receiverId: friendId },
          { senderId: friendId, receiverId: session.userId },
        ],
      },
      orderBy: { createdAt: 'asc' }, // Oldest first for chat UI
      take: 500, // Limit to last 500 messages for now
    });

    return NextResponse.json({ messages });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

const sendMessageSchema = z.object({
  receiverId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { receiverId, content } = sendMessageSchema.parse(body);

    if (receiverId === session.userId) {
      return NextResponse.json({ error: 'Cannot send message to yourself' }, { status: 400 });
    }

    // Verify friendship
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: session.userId, friendId: receiverId },
          { userId: receiverId, friendId: session.userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Not friends' }, { status: 403 });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId: session.userId,
        receiverId,
        content,
      },
    });

    // Emit event to recipient
    emitMessengerEvent(receiverId, Events.MESSENGER_MESSAGE_RECEIVED, { message });

    // Also emit back to sender (in case they have multiple tabs open)
    emitMessengerEvent(session.userId, Events.MESSENGER_MESSAGE_RECEIVED, { message });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
