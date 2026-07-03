import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitMessengerEvent, emitToGroup, Events } from '@/lib/socket/server';
import { z } from 'zod';

const sendMessageSchema = z.object({
  receiverId: z.string().optional(),
  groupId: z.string().optional(),
  content: z.string().min(1).max(4096),
  attachmentId: z.string().optional(),
  attachmentName: z.string().optional(),
}).refine((data) => data.receiverId || data.groupId, {
  message: 'Either receiverId or groupId is required',
});

// GET /api/social/messages?friendId=xxx or ?groupId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const friendId = searchParams.get('friendId');
    const groupId = searchParams.get('groupId');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

    if (groupId) {
      // Verify user is a member
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: session.userId } },
      });
      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
      }

      const messages = await prisma.message.findMany({
        where: { groupId },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      return NextResponse.json({ messages });
    }

    if (!friendId) {
      return NextResponse.json({ error: 'friendId or groupId is required' }, { status: 400 });
    }

    const messages = await prisma.message.findMany({
      where: {
        groupId: null,
        OR: [
          { senderId: session.userId, receiverId: friendId },
          { senderId: friendId, receiverId: session.userId },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    // Mark unread messages as read
    await prisma.message.updateMany({
      where: {
        senderId: friendId,
        receiverId: session.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/social/messages — Send a message (DM or group)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = request.headers.get('content-type') || '';
    let body: any = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (file) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUrl = `data:${file.type || 'application/octet-stream'};base64,${base64}`;

        const { createNode } = await import('@/lib/vfs');
        const node = await createNode({
          name: file.name,
          type: 'FILE',
          content: dataUrl,
          mimeType: file.type,
          ownerId: session.userId,
        });

        // Grant permissions to the receiver(s)
        const receiverId = formData.get('receiverId') as string | null;
        const groupId = formData.get('groupId') as string | null;

        if (receiverId) {
          await prisma.fsPermission.create({
            data: { nodeId: node.id, userId: receiverId, level: 'VIEWER', grantedBy: session.userId },
          });
        } else if (groupId) {
          const members = await prisma.groupMember.findMany({ where: { groupId } });
          const perms = members
            .filter((m) => m.userId !== session.userId)
            .map((m) => ({
              nodeId: node.id,
              userId: m.userId,
              level: 'VIEWER' as any, // TypeScript might complain about enum types in createMany without explicit casting
              grantedBy: session.userId,
            }));
          if (perms.length > 0) {
            await prisma.fsPermission.createMany({ data: perms });
          }
        }

        body.attachmentId = node.id;
        body.attachmentName = file.name;
        body.content = formData.get('content') || `Shared a file: ${file.name}`;
      }

      if (formData.get('receiverId')) body.receiverId = formData.get('receiverId');
      if (formData.get('groupId')) body.groupId = formData.get('groupId');
    } else {
      body = await request.json();
    }

    const { receiverId, groupId, content, attachmentId, attachmentName } = sendMessageSchema.parse(body);

    if (groupId) {
      // Verify membership
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: session.userId } },
      });
      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
      }

      const message = await prisma.message.create({
        data: {
          senderId: session.userId,
          groupId,
          content,
          attachmentId,
          attachmentName,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });

      emitToGroup(groupId, Events.GROUP_MESSAGE_RECEIVED, { message });

      return NextResponse.json({ message }, { status: 201 });
    }

    // DM
    if (!receiverId) {
      return NextResponse.json({ error: 'receiverId is required for DMs' }, { status: 400 });
    }

    // Verify friendship exists
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
      return NextResponse.json({ error: 'You can only message friends' }, { status: 403 });
    }

    const message = await prisma.message.create({
      data: {
        senderId: session.userId,
        receiverId,
        content,
        attachmentId,
        attachmentName,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    // Notify both sender and receiver
    emitMessengerEvent(receiverId, Events.MESSENGER_MESSAGE_RECEIVED, { message });
    emitMessengerEvent(session.userId, Events.MESSENGER_MESSAGE_RECEIVED, { message });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
