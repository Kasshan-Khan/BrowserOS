import { prisma } from '@/lib/db';
import type { AuditAction, Prisma } from '@prisma/client';

export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  resource?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ─── Write an audit log entry ─────────────────────────────────────────────────
// Fire-and-forget: never let audit failures affect user-facing operations

export async function audit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Log to stderr but never throw — audit must not block user operations
    console.error('[Audit] Failed to write audit log:', error);
  }
}

// ─── Query audit logs (admin) ─────────────────────────────────────────────────

export async function getAuditLogs({
  userId,
  action,
  limit = 50,
  offset = 0,
}: {
  userId?: string;
  action?: AuditAction;
  limit?: number;
  offset?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      ...(userId && { userId }),
      ...(action && { action }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      user: {
        select: { id: true, email: true, username: true, displayName: true },
      },
    },
  });
}
