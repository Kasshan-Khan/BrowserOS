import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitToUser, Events } from '@/lib/socket/server';
import { z } from 'zod';

const initiateSchema = z.object({
  receiverId: z.string().min(1),
  fileNodeId: z.string().min(1),
});

const respondSchema = z.object({
  transferId: z.string().min(1),
  action: z.enum(['ACCEPT', 'REJECT']),
});

// GET /api/social/airdrop — List pending incoming transfers
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const transfers = await prisma.fileTransfer.findMany({
      where: {
        receiverId: session.userId,
        status: 'PENDING',
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ transfers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
  }
}

// POST /api/social/airdrop — Initiate a file transfer
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { receiverId, fileNodeId } = initiateSchema.parse(body);

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
      return NextResponse.json({ error: 'You can only send files to friends' }, { status: 403 });
    }

    // Verify file exists and user owns it
    const file = await prisma.fsNode.findFirst({
      where: { id: fileNodeId, ownerId: session.userId, type: 'FILE', isDeleted: false },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Create transfer record
    const transfer = await prisma.fileTransfer.create({
      data: {
        senderId: session.userId,
        receiverId,
        fileNodeId,
        fileName: file.name,
        fileSize: file.size,
        status: 'PENDING',
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    // Notify receiver via socket
    emitToUser(receiverId, Events.AIRDROP_REQUEST, {
      transfer: {
        id: transfer.id,
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        sender: transfer.sender,
      },
    });

    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to initiate transfer' }, { status: 500 });
  }
}

// PATCH /api/social/airdrop — Accept or reject a transfer
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { transferId, action } = respondSchema.parse(body);

    const transfer = await prisma.fileTransfer.findUnique({
      where: { id: transferId },
    });

    if (!transfer || transfer.receiverId !== session.userId) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
    }

    if (transfer.status !== 'PENDING') {
      return NextResponse.json({ error: 'Transfer already processed' }, { status: 400 });
    }

    if (action === 'REJECT') {
      await prisma.fileTransfer.update({
        where: { id: transferId },
        data: { status: 'REJECTED' },
      });

      emitToUser(transfer.senderId, Events.AIRDROP_REJECTED, {
        transferId,
        fileName: transfer.fileName,
      });

      return NextResponse.json({ success: true });
    }

    // ACCEPT — Copy the file to receiver's home directory
    const sourceFile = await prisma.fsNode.findUnique({
      where: { id: transfer.fileNodeId },
    });

    if (!sourceFile) {
      return NextResponse.json({ error: 'Source file no longer exists' }, { status: 404 });
    }

    // Find receiver's home directory
    const homeDir = await prisma.fsNode.findFirst({
      where: {
        ownerId: session.userId,
        type: 'DIRECTORY',
        name: 'home',
        parentId: null,
      },
    });

    // Create a copy of the file in receiver's filesystem
    await prisma.fsNode.create({
      data: {
        name: sourceFile.name,
        type: 'FILE',
        ownerId: session.userId,
        parentId: homeDir?.id ?? null,
        content: sourceFile.content,
        mimeType: sourceFile.mimeType,
        size: sourceFile.size,
        path: homeDir ? `${homeDir.path}/${sourceFile.name}` : `/${sourceFile.name}`,
      },
    });

    // Update transfer status
    await prisma.fileTransfer.update({
      where: { id: transferId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    emitToUser(transfer.senderId, Events.AIRDROP_COMPLETE, {
      transferId,
      fileName: transfer.fileName,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to process transfer' }, { status: 500 });
  }
}
