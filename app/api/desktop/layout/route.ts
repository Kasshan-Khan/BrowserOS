import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { emitDesktopEvent, Events } from '@/lib/socket/server';
import { ok, unauthorized, handleApiError, getClientIp } from '@/lib/api';

const layoutSchema = z.object({
  wallpaper: z.string().max(255).optional(),
  iconLayout: z.array(z.object({
    appId: z.string(),
    x: z.number(),
    y: z.number(),
  })).optional(),
  taskbarApps: z.array(z.string()).max(20).optional(),
});

// GET /api/desktop/layout — Get desktop layout
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const layout = await prisma.desktopLayout.findUnique({
      where: { userId: session.userId },
    });

    if (!layout) {
      // Return defaults
      return ok({
        layout: {
          wallpaper: 'default-gradient',
          iconLayout: [],
          taskbarApps: ['file-explorer', 'terminal', 'text-editor', 'settings'],
        },
      });
    }

    return ok({ layout });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT /api/desktop/layout — Update desktop layout
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const body = await request.json();
    const input = layoutSchema.parse(body);

    const layout = await prisma.desktopLayout.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        wallpaper: input.wallpaper ?? 'default-gradient',
        iconLayout: input.iconLayout ?? [],
        taskbarApps: input.taskbarApps ?? ['file-explorer', 'terminal', 'text-editor', 'settings'],
      },
      update: {
        ...(input.wallpaper !== undefined && { wallpaper: input.wallpaper }),
        ...(input.iconLayout !== undefined && { iconLayout: input.iconLayout }),
        ...(input.taskbarApps !== undefined && { taskbarApps: input.taskbarApps }),
      },
    });

    if (input.wallpaper) {
      await audit({
        userId: session.userId,
        action: 'DESKTOP_WALLPAPER_CHANGE',
        metadata: { wallpaper: input.wallpaper },
        ipAddress: getClientIp(request),
      });
      emitDesktopEvent(session.userId, Events.DESKTOP_WALLPAPER_CHANGED, { wallpaper: input.wallpaper });
    } else {
      await audit({
        userId: session.userId,
        action: 'DESKTOP_LAYOUT_UPDATE',
        ipAddress: getClientIp(request),
      });
      emitDesktopEvent(session.userId, Events.DESKTOP_LAYOUT_UPDATED, { layout });
    }

    return ok({ layout });
  } catch (error) {
    return handleApiError(error);
  }
}
