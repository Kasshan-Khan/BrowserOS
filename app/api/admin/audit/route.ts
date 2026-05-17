import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getAuditLogs } from '@/lib/audit';
import { z } from 'zod';
import type { AuditAction } from '@prisma/client';
import { ok, unauthorized, forbidden, handleApiError } from '@/lib/api';

const querySchema = z.object({
  userId: z.string().cuid().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/admin/audit — Admin-only audit log access
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (session.role !== 'ADMIN') return forbidden('Admin access required');

  try {
    const { searchParams } = new URL(request.url);
    const input = querySchema.parse({
      userId: searchParams.get('userId') ?? undefined,
      action: searchParams.get('action') ?? undefined,
      limit: searchParams.get('limit') ?? 50,
      offset: searchParams.get('offset') ?? 0,
    });

    const logs = await getAuditLogs({
      userId: input.userId,
      action: input.action as AuditAction | undefined,
      limit: input.limit,
      offset: input.offset,
    });

    return ok({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
