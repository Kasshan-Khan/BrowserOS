import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitToUser, Events } from '@/lib/socket/server';
import { redis } from '@/lib/redis';
import { z } from 'zod';

const createSessionSchema = z.object({
  fileId: z.string().min(1),
  inviteeId: z.string().min(1),
});

const COLLAB_TTL = 86400; // 24h

// GET /api/social/collab — List active collab sessions for current user
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get all active collab session IDs from Redis
    const keys = await redis.keys(`collab:session:*:meta`);
    const sessions: Array<{
      sessionId: string; fileId: string; fileName: string;
      ownerId: string; ownerName: string; participants: string[];
    }> = [];

    for (const key of keys) {
      const meta = await redis.hgetall(key);
      if (!meta || !meta.ownerId) continue;

      // Check if current user is owner or invitee
      const participants = JSON.parse(meta.participants || '[]');
      if (meta.ownerId === session.userId || participants.includes(session.userId)) {
        const sessionId = key.replace('collab:session:', '').replace(':meta', '');
        sessions.push({
          sessionId,
          fileId: meta.fileId,
          fileName: meta.fileName,
          ownerId: meta.ownerId,
          ownerName: meta.ownerName,
          participants,
        });
      }
    }

    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

// POST /api/social/collab — Create a collab session and invite someone
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { fileId, inviteeId } = createSessionSchema.parse(body);

    // Verify the file exists and user owns it
    const file = await prisma.fsNode.findFirst({
      where: { id: fileId, ownerId: session.userId, type: 'FILE' },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found or not owned by you' }, { status: 404 });
    }

    // Verify friendship
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: session.userId, friendId: inviteeId },
          { userId: inviteeId, friendId: session.userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'You can only collaborate with friends' }, { status: 403 });
    }

    // Create session ID and store metadata in Redis
    const sessionId = `${session.userId}-${fileId}-${Date.now()}`;
    const metaKey = `collab:session:${sessionId}:meta`;

    await redis.hset(metaKey, {
      fileId,
      fileName: file.name,
      ownerId: session.userId,
      ownerName: session.displayName,
      participants: JSON.stringify([inviteeId]),
      content: file.content ?? '',
      createdAt: new Date().toISOString(),
    });
    await redis.expire(metaKey, COLLAB_TTL);

    // Notify the invitee
    emitToUser(inviteeId, Events.COLLAB_INVITE, {
      sessionId,
      fileId,
      fileName: file.name,
      fromUserId: session.userId,
      fromUsername: session.username,
      fromDisplayName: session.displayName,
    });

    return NextResponse.json({
      sessionId,
      fileId,
      fileName: file.name,
    }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

// DELETE /api/social/collab?sessionId=xxx — End a collab session
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const metaKey = `collab:session:${sessionId}:meta`;
    const meta = await redis.hgetall(metaKey);

    if (!meta || meta.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Session not found or not owned by you' }, { status: 404 });
    }

    // Save final content back to the file
    if (meta.fileId && meta.content) {
      await prisma.fsNode.update({
        where: { id: meta.fileId },
        data: { content: meta.content },
      });
    }

    await redis.del(metaKey);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
  }
}
