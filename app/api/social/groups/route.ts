import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { emitToUser, emitToGroup, Events } from '@/lib/socket/server';
import { z } from 'zod';

const createGroupSchema = z.object({
  name: z.string().min(1).max(64),
  memberIds: z.array(z.string()).min(1).max(9), // + owner = max 10
});

const updateGroupSchema = z.object({
  groupId: z.string(),
  action: z.enum(['ADD_MEMBER', 'REMOVE_MEMBER', 'RENAME', 'LEAVE']),
  memberId: z.string().optional(),
  name: z.string().min(1).max(64).optional(),
});

// GET /api/social/groups — List groups the user belongs to
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const memberships = await prisma.groupMember.findMany({
      where: { userId: session.userId },
      include: {
        group: {
          include: {
            owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            members: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                sender: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map((m) => m.group);
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

// POST /api/social/groups — Create a new group
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, memberIds } = createGroupSchema.parse(body);

    // Verify all members are accepted friends
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userId: session.userId, friendId: { in: memberIds } },
          { friendId: session.userId, userId: { in: memberIds } },
        ],
      },
    });

    const validFriendIds = new Set(
      friendships.map((f) => (f.userId === session.userId ? f.friendId : f.userId))
    );

    const invalidIds = memberIds.filter((id) => !validFriendIds.has(id));
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: 'Some users are not your friends' }, { status: 400 });
    }

    // Create group + members in a transaction
    const group = await prisma.groupChat.create({
      data: {
        name,
        ownerId: session.userId,
        members: {
          create: [
            { userId: session.userId }, // Owner is always a member
            ...memberIds.map((id) => ({ userId: id })),
          ],
        },
      },
      include: {
        owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    // Notify all members about the new group
    for (const id of memberIds) {
      emitToUser(id, Events.GROUP_MEMBER_JOINED, { group });
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}

// PATCH /api/social/groups — Update group (add/remove members, rename, leave)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { groupId, action, memberId, name } = updateGroupSchema.parse(body);

    const group = await prisma.groupChat.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const isMember = group.members.some((m) => m.userId === session.userId);
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    switch (action) {
      case 'ADD_MEMBER': {
        if (group.ownerId !== session.userId) {
          return NextResponse.json({ error: 'Only the owner can add members' }, { status: 403 });
        }
        if (!memberId) {
          return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
        }
        if (group.members.length >= 10) {
          return NextResponse.json({ error: 'Group is full (max 10)' }, { status: 400 });
        }

        await prisma.groupMember.create({
          data: { groupId, userId: memberId },
        });

        emitToUser(memberId, Events.GROUP_MEMBER_JOINED, { groupId, userId: memberId });
        emitToGroup(groupId, Events.GROUP_MEMBER_JOINED, { groupId, userId: memberId });

        return NextResponse.json({ success: true });
      }

      case 'REMOVE_MEMBER': {
        if (group.ownerId !== session.userId) {
          return NextResponse.json({ error: 'Only the owner can remove members' }, { status: 403 });
        }
        if (!memberId || memberId === session.userId) {
          return NextResponse.json({ error: 'Invalid member' }, { status: 400 });
        }

        await prisma.groupMember.deleteMany({
          where: { groupId, userId: memberId },
        });

        emitToUser(memberId, Events.GROUP_MEMBER_LEFT, { groupId, userId: memberId });
        emitToGroup(groupId, Events.GROUP_MEMBER_LEFT, { groupId, userId: memberId });

        return NextResponse.json({ success: true });
      }

      case 'RENAME': {
        if (group.ownerId !== session.userId) {
          return NextResponse.json({ error: 'Only the owner can rename the group' }, { status: 403 });
        }
        if (!name) {
          return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        await prisma.groupChat.update({
          where: { id: groupId },
          data: { name },
        });

        return NextResponse.json({ success: true });
      }

      case 'LEAVE': {
        if (group.ownerId === session.userId) {
          // If owner leaves, delete the group
          await prisma.groupChat.delete({ where: { id: groupId } });
          emitToGroup(groupId, Events.GROUP_MEMBER_LEFT, { groupId, disbanded: true });
        } else {
          await prisma.groupMember.deleteMany({
            where: { groupId, userId: session.userId },
          });
          emitToGroup(groupId, Events.GROUP_MEMBER_LEFT, { groupId, userId: session.userId });
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}
