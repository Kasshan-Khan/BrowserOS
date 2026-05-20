'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useDesktopStore } from '@/store/desktop.store';
import { useFsStore } from '@/store/fs.store';
import { useAuthStore } from '@/store/auth.store';

// Singleton socket instance
let socketInstance: Socket | null = null;

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? '', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setWallpaper, setLayout } = useDesktopStore();
  const { addNode, updateNode, removeNode } = useFsStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    // Desktop sync events
    socket.on('desktop:wallpaper_changed', ({ wallpaper }: { wallpaper: string }) => {
      setWallpaper(wallpaper);
    });

    socket.on('desktop:layout_updated', ({ layout }: { layout: { wallpaper: string; iconLayout: Array<{ appId: string; x: number; y: number }>; taskbarApps: string[] } }) => {
      if (layout) {
        setLayout(layout.wallpaper, layout.iconLayout ?? [], layout.taskbarApps ?? []);
      }
    });

    // File system sync events
    socket.on('fs:node_created', ({ node }: { node: Parameters<typeof addNode>[0] }) => {
      if (node) addNode(node);
    });

    socket.on('fs:node_updated', ({ node }: { node: Parameters<typeof updateNode>[1] & { id: string } }) => {
      if (node?.id) updateNode(node.id, node);
    });

    socket.on('fs:node_deleted', ({ nodeId }: { nodeId: string }) => {
      if (nodeId) removeNode(nodeId);
    });

    socket.on('fs:node_moved', ({ node }: { node: Parameters<typeof updateNode>[1] & { id: string } }) => {
      if (node?.id) updateNode(node.id, node);
    });
  }, [setWallpaper, setLayout, addNode, updateNode, removeNode]);

  useEffect(() => {
    if (!isAuthenticated) return;
    connect();

    return () => {
      // Don't disconnect on unmount — keep socket alive for the session
    };
  }, [isAuthenticated, connect]);

  return socketRef.current;
}
