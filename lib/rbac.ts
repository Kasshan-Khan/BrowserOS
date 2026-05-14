import type { PermissionLevel } from '@prisma/client';

// ─── Permission hierarchy ─────────────────────────────────────────────────────
// OWNER > EDITOR > VIEWER

const PERMISSION_RANK: Record<PermissionLevel, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export function hasPermission(
  userLevel: PermissionLevel,
  required: PermissionLevel
): boolean {
  return PERMISSION_RANK[userLevel] >= PERMISSION_RANK[required];
}

export function canRead(level: PermissionLevel): boolean {
  return hasPermission(level, 'VIEWER');
}

export function canWrite(level: PermissionLevel): boolean {
  return hasPermission(level, 'EDITOR');
}

export function canDelete(level: PermissionLevel): boolean {
  return hasPermission(level, 'OWNER');
}

export function canManagePermissions(level: PermissionLevel): boolean {
  return hasPermission(level, 'OWNER');
}

// ─── Get effective permission for a user on a node ───────────────────────────

import { prisma } from '@/lib/db';

export async function getEffectivePermission(
  userId: string,
  nodeId: string
): Promise<PermissionLevel | null> {
  const perm = await prisma.fsPermission.findUnique({
    where: { nodeId_userId: { nodeId, userId } },
  });
  return perm?.level ?? null;
}

// ─── Assert permission (throws on failure) ────────────────────────────────────

export async function assertPermission(
  userId: string,
  nodeId: string,
  required: PermissionLevel
): Promise<void> {
  const level = await getEffectivePermission(userId, nodeId);

  if (!level || !hasPermission(level, required)) {
    throw new PermissionError(
      `User does not have ${required} permission on node ${nodeId}`
    );
  }
}

export class PermissionError extends Error {
  readonly code = 'PERMISSION_DENIED';
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}
