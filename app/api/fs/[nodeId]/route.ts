import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { readFile, writeFile, renameNode, deleteNode } from '@/lib/vfs';
import { updateNodeSchema } from '@/lib/validations/fs';
import { audit } from '@/lib/audit';
import { emitFsEvent, Events } from '@/lib/socket/server';
import { ok, noContent, unauthorized, notFound, handleApiError, getClientIp } from '@/lib/api';

type Params = { params: Promise<{ nodeId: string }> };

// GET /api/fs/:nodeId — Read node
export async function GET(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    const node = await readFile(session.userId, nodeId);
    if (!node) return notFound();

    return ok({ node });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/fs/:nodeId — Update content or rename
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    const body = await request.json();
    const input = updateNodeSchema.parse(body);

    let node;

    if (input.name !== undefined) {
      node = await renameNode(session.userId, nodeId, input.name);
      await audit({
        userId: session.userId,
        action: 'FS_RENAME',
        resource: `fs_node:${nodeId}`,
        metadata: { newName: input.name },
        ipAddress: getClientIp(request),
      });
    }

    if (input.content !== undefined) {
      node = await writeFile(session.userId, nodeId, input.content);
      await audit({
        userId: session.userId,
        action: 'FS_UPDATE',
        resource: `fs_node:${nodeId}`,
        ipAddress: getClientIp(request),
      });
    }

    emitFsEvent(session.userId, Events.FS_NODE_UPDATED, { node });

    return ok({ node });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/fs/:nodeId — Soft delete
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { nodeId } = await params;
    await deleteNode(session.userId, nodeId);

    await audit({
      userId: session.userId,
      action: 'FS_DELETE',
      resource: `fs_node:${nodeId}`,
      ipAddress: getClientIp(request),
    });

    emitFsEvent(session.userId, Events.FS_NODE_DELETED, { nodeId });

    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
