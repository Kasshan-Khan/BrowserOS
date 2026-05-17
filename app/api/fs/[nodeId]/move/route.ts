import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { moveNode } from '@/lib/vfs';
import { moveNodeSchema } from '@/lib/validations/fs';
import { audit } from '@/lib/audit';
import { emitFsEvent, Events } from '@/lib/socket/server';
import { ok, unauthorized, handleApiError, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ nodeId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    const body = await request.json();
    const input = moveNodeSchema.parse(body);

    const node = await moveNode(session.userId, nodeId, input.newParentId);

    await audit({
      userId: session.userId,
      action: 'FS_MOVE',
      resource: `fs_node:${nodeId}`,
      metadata: { newParentId: input.newParentId },
      ipAddress: getClientIp(request),
    });

    emitFsEvent(session.userId, Events.FS_NODE_MOVED, { node });

    return ok({ node });
  } catch (error) {
    return handleApiError(error);
  }
}
