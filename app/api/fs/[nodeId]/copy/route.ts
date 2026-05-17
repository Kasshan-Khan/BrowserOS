import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { copyNode } from '@/lib/vfs';
import { copyNodeSchema } from '@/lib/validations/fs';
import { audit } from '@/lib/audit';
import { emitFsEvent, Events } from '@/lib/socket/server';
import { created, unauthorized, handleApiError, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ nodeId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    const body = await request.json();
    const input = copyNodeSchema.parse(body);

    const node = await copyNode(session.userId, nodeId, input.newParentId, input.newName);

    await audit({
      userId: session.userId,
      action: 'FS_COPY',
      resource: `fs_node:${nodeId}`,
      metadata: { newParentId: input.newParentId },
      ipAddress: getClientIp(request),
    });

    emitFsEvent(session.userId, Events.FS_NODE_CREATED, { node });

    return created({ node });
  } catch (error) {
    return handleApiError(error);
  }
}
