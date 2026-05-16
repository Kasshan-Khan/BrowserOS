import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPub, redisSub } from '@/lib/redis';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { parse as parseCookie } from 'cookie';

// ─── Global singleton ─────────────────────────────────────────────────────────

const globalForSocket = globalThis as unknown as {
  io: SocketIOServer | undefined;
};

// ─── Room name builders ───────────────────────────────────────────────────────

export const Rooms = {
  userDesktop: (userId: string) => `desktop:${userId}`,
  userFs: (userId: string) => `fs:${userId}`,
  userNotifications: (userId: string) => `notify:${userId}`,
} as const;

// ─── Event names ──────────────────────────────────────────────────────────────

export const Events = {
  // Desktop sync
  DESKTOP_LAYOUT_UPDATED: 'desktop:layout_updated',
  DESKTOP_WALLPAPER_CHANGED: 'desktop:wallpaper_changed',

  // File system sync
  FS_NODE_CREATED: 'fs:node_created',
  FS_NODE_UPDATED: 'fs:node_updated',
  FS_NODE_DELETED: 'fs:node_deleted',
  FS_NODE_MOVED: 'fs:node_moved',

  // Notifications
  NOTIFICATION: 'notification',

  // Window state
  WINDOW_STATE_UPDATED: 'window:state_updated',
} as const;

// ─── Initialize Socket.IO server ──────────────────────────────────────────────

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  if (globalForSocket.io) return globalForSocket.io;

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for horizontal scaling
  io.adapter(createAdapter(redisPub, redisSub));

  // ─── Authentication middleware ─────────────────────────────────────────────

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';
      const cookies = parseCookie(cookieHeader);
      const sessionToken = cookies[SESSION_COOKIE];

      if (!sessionToken) {
        return next(new Error('Authentication required'));
      }

      // We need to mock the cookies() API here since socket.io doesn't use Next.js
      // Instead read session directly from token
      const { redis, RedisKeys } = await import('@/lib/redis');
      const cached = await redis.get(RedisKeys.session(sessionToken));

      if (!cached) {
        return next(new Error('Invalid or expired session'));
      }

      const session = JSON.parse(cached);
      socket.data.userId = session.userId;
      socket.data.username = session.username;
      socket.data.sessionId = session.sessionId;

      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  // ─── Connection handler ────────────────────────────────────────────────────

  io.on('connection', async (socket) => {
    const { userId } = socket.data;

    console.log(`[Socket.IO] Client connected: ${userId} (${socket.id})`);

    // Join personal rooms
    await socket.join(Rooms.userDesktop(userId));
    await socket.join(Rooms.userFs(userId));
    await socket.join(Rooms.userNotifications(userId));

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${userId} — ${reason}`);
    });

    // Client acknowledges it's ready
    socket.emit('ready', { userId });
  });

  globalForSocket.io = io;
  return io;
}

export function getIO(): SocketIOServer | undefined {
  return globalForSocket.io;
}

// ─── Emit helpers (server-side) ───────────────────────────────────────────────

export function emitToUser(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.userNotifications(userId)).emit(event, data);
}

export function emitFsEvent(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.userFs(userId)).emit(event, data);
}

export function emitDesktopEvent(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.userDesktop(userId)).emit(event, data);
}
