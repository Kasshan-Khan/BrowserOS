import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { ok, unauthorized, handleApiError } from '@/lib/api';
import type { Prisma } from '@prisma/client';

const windowStateSchema = z.object({
  instanceId: z.string(),
  appId: z.string(),
  title: z.string().max(255),
  x: z.number(),
  y: z.number(),
  width: z.number().min(100),
  height: z.number().min(100),
  isMinimized: z.boolean(),
  isMaximized: z.boolean(),
  zIndex: z.number(),
  appState: z.record(z.unknown()).default({}),
});

// GET /api/desktop/windows — Get persisted window states
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const windows = await prisma.windowState.findMany({
      where: { userId: session.userId },
      orderBy: { zIndex: 'asc' },
    });
    return ok({ windows });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/desktop/windows — Batch upsert window states
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const windows = z.array(windowStateSchema).parse(body.windows);

    // Upsert all windows in a transaction
    await prisma.$transaction(
      windows.map((w) =>
        prisma.windowState.upsert({
          where: {
            userId_instanceId: {
              userId: session.userId,
              instanceId: w.instanceId,
            },
          },
          create: {
            userId: session.userId,
            instanceId: w.instanceId,
            appId: w.appId,
            title: w.title,
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            isMinimized: w.isMinimized,
            isMaximized: w.isMaximized,
            zIndex: w.zIndex,
            appState: w.appState as Prisma.InputJsonValue,
          },
          update: {
            title: w.title,
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            isMinimized: w.isMinimized,
            isMaximized: w.isMaximized,
            zIndex: w.zIndex,
            appState: w.appState as Prisma.InputJsonValue,
          },
        })
      )
    );

    return ok({ message: 'Window states saved' });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/desktop/windows?instanceId=xxx
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (instanceId) {
      await prisma.windowState.deleteMany({
        where: { userId: session.userId, instanceId },
      });
    } else {
      // Clear all windows
      await prisma.windowState.deleteMany({
        where: { userId: session.userId },
      });
    }

    return ok({ message: 'Deleted' });
  } catch (error) {
    return handleApiError(error);
  }
}
