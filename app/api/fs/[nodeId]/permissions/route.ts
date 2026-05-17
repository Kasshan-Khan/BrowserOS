import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/rbac';
import { grantPermissionSchema } from '@/lib/validations/fs';
import { audit } from '@/lib/audit';
import { ok, noContent, unauthorized, handleApiError, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ nodeId: string }> };

// GET /api/fs/:nodeId/permissions — List permissions
export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    await assertPermission(session.userId, nodeId, 'OWNER');

    const permissions = await prisma.fsPermission.findMany({
      where: { nodeId },
      include: {
        user: {
          select: { id: true, email: true, username: true, displayName: true },
        },
      },
    });

    return ok({ permissions });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/fs/:nodeId/permissions — Grant permission
export async function POST(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    await assertPermission(session.userId, nodeId, 'OWNER');

    const body = await request.json();
    const input = grantPermissionSchema.parse(body);

    const permission = await prisma.fsPermission.upsert({
      where: { nodeId_userId: { nodeId, userId: input.userId } },
      create: {
        nodeId,
        userId: input.userId,
        level: input.level,
        grantedBy: session.userId,
      },
      update: { level: input.level },
    });

    await audit({
      userId: session.userId,
      action: 'FS_PERMISSION_GRANT',
      resource: `fs_node:${nodeId}`,
      metadata: { targetUserId: input.userId, level: input.level },
      ipAddress: getClientIp(request),
    });

    return ok({ permission });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/fs/:nodeId/permissions?userId=xxx — Revoke permission
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    await assertPermission(session.userId, nodeId, 'OWNER');

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    if (!targetUserId) return unauthorized('userId required');

    // Can't revoke own owner permission
    if (targetUserId === session.userId) {
      return unauthorized('Cannot revoke your own owner permission');
    }

    await prisma.fsPermission.deleteMany({
      where: { nodeId, userId: targetUserId },
    });

    await audit({
      userId: session.userId,
      action: 'FS_PERMISSION_REVOKE',
      resource: `fs_node:${nodeId}`,
      metadata: { targetUserId },
      ipAddress: getClientIp(request),
    });

    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
