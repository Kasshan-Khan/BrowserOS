'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useDesktopStore } from '@/store/desktop.store';
import { useFsStore } from '@/store/fs.store';
import { useWindowStore } from '@/store/window.store';
import { appRegistry } from '@/registry/app-registry';
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
  const openWindow = useWindowStore((s) => s.openWindow);

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

    // Collab invites
    socket.on('collab:invite', (inviteData: any) => {
      const app = appRegistry.get('collab-editor');
      if (app) {
        openWindow({
          instanceId: `collab-${inviteData.fileId}`,
          appId: 'collab-editor',
          title: inviteData.fileName,
          x: Math.round(window.innerWidth / 2 - app.defaultSize.width / 2),
          y: Math.round(window.innerHeight / 2 - app.defaultSize.height / 2),
          width: app.defaultSize.width,
          height: app.defaultSize.height,
          isMinimized: false,
          isMaximized: false,
          appState: {
            fileId: inviteData.fileId,
            fileName: inviteData.fileName,
            collabSession: inviteData, // pass the whole session object
          },
        });
      }
    });
  }, [setWallpaper, setLayout, addNode, updateNode, removeNode, openWindow]);

  useEffect(() => {
    if (!isAuthenticated) return;
    connect();

    return () => {
      // Don't disconnect on unmount — keep socket alive for the session
    };
  }, [isAuthenticated, connect]);

  return socketRef.current;
}
