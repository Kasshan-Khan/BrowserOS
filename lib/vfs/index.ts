import { prisma } from '@/lib/db';
import { assertPermission, PermissionError } from '@/lib/rbac';
import type { FsNode, FsNodeType } from '@prisma/client';

export type { FsNode };

// ─── Path utilities ───────────────────────────────────────────────────────────

export function joinPath(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
}

export function dirname(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function basename(path: string): string {
  return path.split('/').pop() ?? '';
}

// ─── Create a file or directory ───────────────────────────────────────────────

export async function createNode({
  name,
  type,
  parentId,
  ownerId,
  content,
  mimeType,
}: {
  name: string;
  type: FsNodeType;
  parentId?: string;
  ownerId: string;
  content?: string;
  mimeType?: string;
}): Promise<FsNode> {
  // Validate name
  if (!name || name.includes('/') || name === '.' || name === '..') {
    throw new Error('Invalid file name');
  }

  // Build path
  let path = `/${name}`;
  if (parentId) {
    const parent = await prisma.fsNode.findUnique({ where: { id: parentId } });
    if (!parent || parent.isDeleted) throw new Error('Parent directory not found');
    if (parent.type !== 'DIRECTORY') throw new Error('Parent is not a directory');

    // Check EDITOR permission on parent (if not owner)
    if (parent.ownerId !== ownerId) {
      await assertPermission(ownerId, parentId, 'EDITOR');
    }

    path = joinPath(parent.path, name);
  }

  // Check for duplicate name in same directory
  const existing = await prisma.fsNode.findFirst({
    where: { parentId: parentId ?? null, name, isDeleted: false, ownerId },
  });
  if (existing) throw new Error(`A file named "${name}" already exists here`);

  const size = content ? Buffer.byteLength(content, 'utf8') : 0;

  const node = await prisma.fsNode.create({
    data: {
      name,
      type,
      parentId,
      ownerId,
      content,
      mimeType,
      size,
      path,
    },
  });

  // Auto-grant OWNER permission
  await prisma.fsPermission.create({
    data: {
      nodeId: node.id,
      userId: ownerId,
      level: 'OWNER',
      grantedBy: ownerId,
    },
  });

  return node;
}

// ─── List directory contents ──────────────────────────────────────────────────

export async function listDirectory(
  userId: string,
  parentId?: string
): Promise<FsNode[]> {
  // If listing a non-root directory, check read access
  if (parentId) {
    await assertPermission(userId, parentId, 'VIEWER');
  }

  return prisma.fsNode.findMany({
    where: {
      parentId: parentId ?? null,
      isDeleted: false,
      OR: [
        { ownerId: userId },
        { permissions: { some: { userId } } },
      ],
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
}

// ─── Read file content ────────────────────────────────────────────────────────

export async function readFile(userId: string, nodeId: string): Promise<FsNode> {
  await assertPermission(userId, nodeId, 'VIEWER');

  const node = await prisma.fsNode.findUnique({ where: { id: nodeId } });
  if (!node || node.isDeleted) throw new Error('File not found');

  return node;
}

// ─── Write file content ───────────────────────────────────────────────────────

export async function writeFile(
  userId: string,
  nodeId: string,
  content: string
): Promise<FsNode> {
  await assertPermission(userId, nodeId, 'EDITOR');

  const node = await prisma.fsNode.findUnique({ where: { id: nodeId } });
  if (!node || node.isDeleted) throw new Error('File not found');
  if (node.type !== 'FILE') throw new Error('Cannot write to a directory');

  return prisma.fsNode.update({
    where: { id: nodeId },
    data: {
      content,
      size: Buffer.byteLength(content, 'utf8'),
    },
  });
}

// ─── Rename node ──────────────────────────────────────────────────────────────

export async function renameNode(
  userId: string,
  nodeId: string,
  newName: string
): Promise<FsNode> {
  if (!newName || newName.includes('/')) throw new Error('Invalid name');

  await assertPermission(userId, nodeId, 'EDITOR');

  const node = await prisma.fsNode.findUnique({ where: { id: nodeId } });
  if (!node || node.isDeleted) throw new Error('Node not found');

  const newPath = joinPath(dirname(node.path), newName);

  // Update this node and all children paths
  await updateChildPaths(node.path, newPath);

  return prisma.fsNode.update({
    where: { id: nodeId },
    data: { name: newName, path: newPath },
  });
}

// ─── Move node ────────────────────────────────────────────────────────────────

export async function moveNode(
  userId: string,
  nodeId: string,
  newParentId: string | null
): Promise<FsNode> {
  await assertPermission(userId, nodeId, 'OWNER');
  if (newParentId) await assertPermission(userId, newParentId, 'EDITOR');

  const node = await prisma.fsNode.findUnique({ where: { id: nodeId } });
  if (!node || node.isDeleted) throw new Error('Node not found');

  let newParentPath = '';
  if (newParentId) {
    const parent = await prisma.fsNode.findUnique({ where: { id: newParentId } });
    if (!parent || parent.isDeleted) throw new Error('Target directory not found');
    if (parent.type !== 'DIRECTORY') throw new Error('Target is not a directory');
    if (parent.path.startsWith(node.path)) throw new Error('Cannot move to a subdirectory of itself');
    newParentPath = parent.path;
  }

  const oldPath = node.path;
  const newPath = joinPath(newParentPath, node.name);

  await updateChildPaths(oldPath, newPath);

  return prisma.fsNode.update({
    where: { id: nodeId },
    data: { parentId: newParentId, path: newPath },
  });
}

// ─── Copy node ────────────────────────────────────────────────────────────────

export async function copyNode(
  userId: string,
  nodeId: string,
  newParentId: string | null,
  newName?: string
): Promise<FsNode> {
  await assertPermission(userId, nodeId, 'VIEWER');
  if (newParentId) await assertPermission(userId, newParentId, 'EDITOR');

  const node = await prisma.fsNode.findUnique({ where: { id: nodeId } });
  if (!node || node.isDeleted) throw new Error('Node not found');

  const name = newName ?? `${node.name} (copy)`;
  return createNode({
    name,
    type: node.type,
    parentId: newParentId ?? undefined,
    ownerId: userId,
    content: node.content ?? undefined,
    mimeType: node.mimeType ?? undefined,
  });
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function deleteNode(
  userId: string,
  nodeId: string
): Promise<void> {
  await assertPermission(userId, nodeId, 'OWNER');

  await prisma.fsNode.updateMany({
    where: {
      OR: [
        { id: nodeId },
        { path: { startsWith: (await prisma.fsNode.findUnique({ where: { id: nodeId } }))?.path + '/' } },
      ],
    },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchNodes(
  userId: string,
  query: string,
  limit = 20
): Promise<FsNode[]> {
  return prisma.fsNode.findMany({
    where: {
      isDeleted: false,
      name: { contains: query, mode: 'insensitive' },
      OR: [
        { ownerId: userId },
        { permissions: { some: { userId } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

// ─── Helper: update all child paths after move/rename ────────────────────────

async function updateChildPaths(
  oldPathPrefix: string,
  newPathPrefix: string
): Promise<void> {
  // Get all nodes that start with oldPathPrefix
  const nodes = await prisma.fsNode.findMany({
    where: {
      path: { startsWith: oldPathPrefix },
      isDeleted: false,
    },
  });

  const updates = nodes.map((n) =>
    prisma.fsNode.update({
      where: { id: n.id },
      data: { path: n.path.replace(oldPathPrefix, newPathPrefix) },
    })
  );

  await prisma.$transaction(updates);
}

// ─── Bootstrap home directory for new users ──────────────────────────────────

export async function bootstrapUserHomeDirectory(userId: string): Promise<void> {
  const existing = await prisma.fsNode.findFirst({
    where: { ownerId: userId, parentId: null, name: 'home', isDeleted: false },
  });
  if (existing) return;

  // /home
  const home = await createNode({ name: 'home', type: 'DIRECTORY', ownerId: userId });

  // /home/Documents
  await createNode({ name: 'Documents', type: 'DIRECTORY', parentId: home.id, ownerId: userId });
  // /home/Downloads
  await createNode({ name: 'Downloads', type: 'DIRECTORY', parentId: home.id, ownerId: userId });
  // /home/Desktop
  await createNode({ name: 'Desktop', type: 'DIRECTORY', parentId: home.id, ownerId: userId });

  // Welcome file
  await createNode({
    name: 'Welcome.txt',
    type: 'FILE',
    parentId: home.id,
    ownerId: userId,
    content: 'Welcome to BrowserOS!\n\nThis is your home directory. Feel free to create files and folders.',
    mimeType: 'text/plain',
  });
}
