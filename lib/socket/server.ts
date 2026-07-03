import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPub, redisSub, redis } from '@/lib/redis';
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
  collabSession: (sessionId: string) => `collab:session:${sessionId}`,
  groupChat: (groupId: string) => `group:${groupId}`,
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

  // Messenger
  MESSENGER_MESSAGE_RECEIVED: 'messenger:message_received',
  MESSENGER_FRIEND_REQUEST: 'messenger:friend_request',

  // Presence
  PRESENCE_ONLINE: 'presence:online',
  PRESENCE_OFFLINE: 'presence:offline',
  PRESENCE_STATUS_CHANGED: 'presence:status_changed',
  PRESENCE_ACTIVITY_CHANGED: 'presence:activity_changed',

  // Group chat
  GROUP_MESSAGE_RECEIVED: 'group:message_received',
  GROUP_MEMBER_JOINED: 'group:member_joined',
  GROUP_MEMBER_LEFT: 'group:member_left',

  // Collaborative editing
  COLLAB_INVITE: 'collab:invite',
  COLLAB_JOIN: 'collab:join',
  COLLAB_LEAVE: 'collab:leave',
  COLLAB_CONTENT_CHANGE: 'collab:content_change',
  COLLAB_CURSOR_MOVE: 'collab:cursor_move',

  // WebRTC signaling
  CALL_INITIATE: 'call:initiate',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',
  CALL_END: 'call:end',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice_candidate',

  // AirDrop
  AIRDROP_REQUEST: 'airdrop:request',
  AIRDROP_ACCEPTED: 'airdrop:accepted',
  AIRDROP_REJECTED: 'airdrop:rejected',
  AIRDROP_COMPLETE: 'airdrop:complete',
} as const;

// ─── Redis keys for presence ──────────────────────────────────────────────────

const ONLINE_USERS_KEY = 'online_users';

export async function setUserOnline(userId: string): Promise<void> {
  await redis.sadd(ONLINE_USERS_KEY, userId);
}

export async function setUserOffline(userId: string): Promise<void> {
  await redis.srem(ONLINE_USERS_KEY, userId);
}

export async function getOnlineUsers(): Promise<string[]> {
  return redis.smembers(ONLINE_USERS_KEY);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redis.sismember(ONLINE_USERS_KEY, userId)) === 1;
}

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

      const { redis: redisClient, RedisKeys } = await import('@/lib/redis');
      const cached = await redisClient.get(RedisKeys.session(sessionToken));

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
    const { userId, username } = socket.data;

    console.log(`[Socket.IO] Client connected: ${userId} (${socket.id})`);

    // Join personal rooms
    await socket.join(Rooms.userDesktop(userId));
    await socket.join(Rooms.userFs(userId));
    await socket.join(Rooms.userNotifications(userId));

    // Mark user online
    await setUserOnline(userId);

    // Broadcast online status to friends
    broadcastPresence(io, userId, 'online');

    // ─── Presence events ─────────────────────────────────────────────────────

    socket.on('presence:set_status', async (data: { status?: string; statusText?: string }) => {
      // Client can update status directly via socket too
      emitToUser(userId, Events.PRESENCE_STATUS_CHANGED, {
        userId,
        ...data,
      });
    });

    socket.on('presence:activity', async (data: { currentApp: string | null }) => {
      // Broadcast what app the user is currently using
      broadcastPresence(io, userId, 'activity', data);
    });

    // ─── Collaborative editing events ────────────────────────────────────────

    socket.on('collab:join', async ({ sessionId }: { sessionId: string }) => {
      await socket.join(Rooms.collabSession(sessionId));
      socket.to(Rooms.collabSession(sessionId)).emit(Events.COLLAB_JOIN, {
        userId,
        username,
      });
    });

    socket.on('collab:leave', async ({ sessionId }: { sessionId: string }) => {
      socket.to(Rooms.collabSession(sessionId)).emit(Events.COLLAB_LEAVE, {
        userId,
        username,
      });
      await socket.leave(Rooms.collabSession(sessionId));
    });

    socket.on('collab:content_change', ({ sessionId, content, cursorPos }: { sessionId: string; content: string; cursorPos: number }) => {
      socket.to(Rooms.collabSession(sessionId)).emit(Events.COLLAB_CONTENT_CHANGE, {
        userId,
        username,
        content,
        cursorPos,
      });
    });

    socket.on('collab:cursor_move', ({ sessionId, line, column }: { sessionId: string; line: number; column: number }) => {
      socket.to(Rooms.collabSession(sessionId)).emit(Events.COLLAB_CURSOR_MOVE, {
        userId,
        username,
        line,
        column,
      });
    });

    // ─── WebRTC signaling relay ──────────────────────────────────────────────

    socket.on('call:offer', ({ targetUserId, offer }: { targetUserId: string; offer: RTCSessionDescriptionInit }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_OFFER, {
        fromUserId: userId,
        fromUsername: username,
        offer,
      });
    });

    socket.on('call:answer', ({ targetUserId, answer }: { targetUserId: string; answer: RTCSessionDescriptionInit }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_ANSWER, {
        fromUserId: userId,
        answer,
      });
    });

    socket.on('call:ice_candidate', ({ targetUserId, candidate }: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_ICE_CANDIDATE, {
        fromUserId: userId,
        candidate,
      });
    });

    socket.on('call:initiate', ({ targetUserId, callType }: { targetUserId: string; callType: 'audio' | 'video' }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_INITIATE, {
        fromUserId: userId,
        fromUsername: username,
        callType,
      });
    });

    socket.on('call:accept', ({ targetUserId }: { targetUserId: string }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_ACCEPT, {
        fromUserId: userId,
      });
    });

    socket.on('call:reject', ({ targetUserId }: { targetUserId: string }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_REJECT, {
        fromUserId: userId,
      });
    });

    socket.on('call:end', ({ targetUserId }: { targetUserId: string }) => {
      io.to(Rooms.userNotifications(targetUserId)).emit(Events.CALL_END, {
        fromUserId: userId,
      });
    });

    // ─── Group chat room management ──────────────────────────────────────────

    socket.on('group:join', async ({ groupId }: { groupId: string }) => {
      await socket.join(Rooms.groupChat(groupId));
    });

    // ─── Disconnect ──────────────────────────────────────────────────────────

    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${userId} — ${reason}`);

      // Check if user has other active connections before marking offline
      const sockets = await io.in(Rooms.userNotifications(userId)).fetchSockets();
      if (sockets.length === 0) {
        await setUserOffline(userId);
        broadcastPresence(io, userId, 'offline');
      }
    });

    // Client acknowledges it's ready
    socket.emit('ready', { userId });
  });

  globalForSocket.io = io;
  return io;
}

// ─── Presence broadcast helper ────────────────────────────────────────────────

async function broadcastPresence(
  io: SocketIOServer,
  userId: string,
  type: 'online' | 'offline' | 'activity',
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userId }, { friendId: userId }],
      },
    });

    const friendIds = friendships.map((f) =>
      f.userId === userId ? f.friendId : f.userId
    );

    const event = type === 'activity'
      ? Events.PRESENCE_ACTIVITY_CHANGED
      : type === 'online'
        ? Events.PRESENCE_ONLINE
        : Events.PRESENCE_OFFLINE;

    for (const friendId of friendIds) {
      io.to(Rooms.userNotifications(friendId)).emit(event, {
        userId,
        ...data,
      });
    }
  } catch (err) {
    console.error('[Socket.IO] Failed to broadcast presence:', err);
  }
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

export function emitMessengerEvent(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.userNotifications(userId)).emit(event, data);
}

export function emitToGroup(groupId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.groupChat(groupId)).emit(event, data);
}

export function emitCollabEvent(sessionId: string, event: string, data: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(Rooms.collabSession(sessionId)).emit(event, data);
}
