import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createNode, listDirectory } from '@/lib/vfs';
import { createNodeSchema, searchSchema } from '@/lib/validations/fs';
import { audit } from '@/lib/audit';
import { emitFsEvent } from '@/lib/socket/server';
import { Events } from '@/lib/socket/server';
import { ok, created, unauthorized, handleApiError, getClientIp } from '@/lib/api';

// GET /api/fs?parentId=xxx — List directory contents
// GET /api/fs?q=query — Search
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (q) {
      const { searchNodes } = await import('@/lib/vfs');
      const input = searchSchema.parse({ q, limit: searchParams.get('limit') ?? 20 });
      const nodes = await searchNodes(session.userId, input.q, input.limit);
      return ok({ nodes });
    }

    const parentId = searchParams.get('parentId') ?? undefined;
    const nodes = await listDirectory(session.userId, parentId);
    return ok({ nodes });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/fs — Create file or directory
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const input = createNodeSchema.parse(body);

    const node = await createNode({
      ...input,
      ownerId: session.userId,
    });

    await audit({
      userId: session.userId,
      action: 'FS_CREATE',
      resource: `fs_node:${node.id}`,
      metadata: { name: node.name, type: node.type },
      ipAddress: getClientIp(request),
    });

    // Notify all connected devices of this user
    emitFsEvent(session.userId, Events.FS_NODE_CREATED, { node });

    return created({ node });
  } catch (error) {
    return handleApiError(error);
  }
}
