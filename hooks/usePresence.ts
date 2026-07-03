'use client';

import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { useSocket } from './useSocket';
import { useAuthStore } from '@/store/auth.store';

// ─── Presence store ───────────────────────────────────────────────────────────

interface FriendPresence {
  status: string;
  statusText: string | null;
  currentApp: string | null;
}

interface PresenceState {
  onlineUsers: Set<string>;
  friendPresence: Map<string, FriendPresence>;

  setOnline: (userId: string) => void;
  setOffline: (userId: string) => void;
  updatePresence: (userId: string, data: Partial<FriendPresence>) => void;
  setInitialOnline: (userIds: string[]) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set<string>(),
  friendPresence: new Map<string, FriendPresence>(),

  setOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.add(userId);
      return { onlineUsers: next };
    }),

  setOffline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  updatePresence: (userId, data) =>
    set((state) => {
      const next = new Map(state.friendPresence);
      const existing = next.get(userId) ?? { status: 'ONLINE', statusText: null, currentApp: null };
      next.set(userId, { ...existing, ...data });
      return { friendPresence: next };
    }),

  setInitialOnline: (userIds) =>
    set({ onlineUsers: new Set(userIds) }),
}));

// ─── Presence hook ────────────────────────────────────────────────────────────

export function usePresence() {
  const socket = useSocket();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setOnline, setOffline, updatePresence, setInitialOnline } = usePresenceStore();

  // Fetch initial online friends list
  const fetchOnlineFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/social/friends');
      if (!res.ok) return;
      const { friendships } = await res.json();

      // We'll consider any accepted friendship where the friend has status !== OFFLINE
      const onlineIds: string[] = [];
      for (const f of friendships) {
        if (f.status !== 'ACCEPTED') continue;
        const other = f.user ?? f.friend;
        if (other?.status && other.status !== 'OFFLINE') {
          onlineIds.push(other.id);
        }
      }
      setInitialOnline(onlineIds);
    } catch {
      // non-critical
    }
  }, [setInitialOnline]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchOnlineFriends();
  }, [isAuthenticated, fetchOnlineFriends]);

  // Listen for presence socket events
  useEffect(() => {
    if (!socket) return;

    const onOnline = ({ userId }: { userId: string }) => {
      setOnline(userId);
    };

    const onOffline = ({ userId }: { userId: string }) => {
      setOffline(userId);
    };

    const onStatusChanged = ({ userId, status, statusText, currentApp }: {
      userId: string; status?: string; statusText?: string; currentApp?: string;
    }) => {
      setOnline(userId);
      updatePresence(userId, {
        ...(status && { status }),
        ...(statusText !== undefined && { statusText }),
        ...(currentApp !== undefined && { currentApp }),
      });
    };

    const onActivityChanged = ({ userId, currentApp }: { userId: string; currentApp: string | null }) => {
      updatePresence(userId, { currentApp });
    };

    socket.on('presence:online', onOnline);
    socket.on('presence:offline', onOffline);
    socket.on('presence:status_changed', onStatusChanged);
    socket.on('presence:activity_changed', onActivityChanged);

    return () => {
      socket.off('presence:online', onOnline);
      socket.off('presence:offline', onOffline);
      socket.off('presence:status_changed', onStatusChanged);
      socket.off('presence:activity_changed', onActivityChanged);
    };
  }, [socket, setOnline, setOffline, updatePresence]);
}
