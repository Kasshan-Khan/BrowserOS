'use client';

import { useEffect, useCallback } from 'react';
import { useDesktopStore } from '@/store/desktop.store';
import { useWindowStore } from '@/store/window.store';
import { DesktopIcons } from './DesktopIcons';
import { DesktopContextMenu } from './DesktopContextMenu';
import { Taskbar } from '../taskbar/Taskbar';
import { WindowManager } from '../window/WindowManager';
import { GlobalSearch } from '../search/GlobalSearch';
import { useDesktopSync } from '@/hooks/useDesktopSync';
import { useWindowPersistence } from '@/hooks/useWindowPersistence';
import { useDesktopLayoutPersistence } from '@/hooks/useDesktopLayoutPersistence';
import { useSocket } from '@/hooks/useSocket';
import { appRegistry } from '@/registry/app-registry';
import { v4 as uuidv4 } from 'uuid';
import { ToastContainer } from '@/components/ui/Toast';

export function Desktop() {
  const { wallpaper, showContextMenu, hideContextMenu } = useDesktopStore();
  const { setWindows, openWindow } = useWindowStore();

  // Sync desktop layout from server on mount
  useDesktopSync();

  // Auto-persist window state changes (debounced)
  useWindowPersistence();

  // Auto-persist desktop layout changes (debounced)
  useDesktopLayoutPersistence();

  // Realtime multi-device sync via Socket.IO
  useSocket();

  // Load persisted window states on mount
  useEffect(() => {
    async function loadWindowStates() {
      try {
        const res = await fetch('/api/desktop/windows', { credentials: 'include' });
        if (res.ok) {
          const { data } = await res.json();
          if (data.windows?.length) {
            setWindows(
              data.windows.map((w: Record<string, unknown>) => ({
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
                appState: w.appState ?? {},
              }))
            );
          }
        }
      } catch {
        // Non-critical
      }
    }
    loadWindowStates();
  }, [setWindows]);

  // Global keyboard shortcuts (Ctrl/Meta + key)
  useEffect(() => {
    const shortcuts: Record<string, string> = {
      e: 'file-explorer',
      t: 'terminal',
      ',': 'settings',
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      // Ignore Ctrl+Space — that's for global search (handled in GlobalSearch)
      if (e.key === ' ') return;

      const appId = shortcuts[e.key.toLowerCase()];
      if (!appId) return;

      e.preventDefault();
      const app = appRegistry.get(appId);
      if (!app) return;

      openWindow({
        instanceId: uuidv4(),
        appId,
        title: app.name,
        x: 120 + Math.round(Math.random() * 100),
        y: 80 + Math.round(Math.random() * 60),
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        isMinimized: false,
        isMaximized: false,
        appState: {},
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openWindow]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      showContextMenu({ x: e.clientX, y: e.clientY, target: 'desktop' });
    },
    [showContextMenu]
  );

  const handleClick = useCallback(() => {
    hideContextMenu();
  }, [hideContextMenu]);

  const wallpaperClass = `wallpaper-${wallpaper}`;

  return (
    <div
      className={`desktop-root ${wallpaperClass}`}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      role="main"
      aria-label="Desktop"
    >
      {/* Desktop icons */}
      <DesktopIcons />

      {/* Open windows */}
      <WindowManager />

      {/* Right-click context menu */}
      <DesktopContextMenu />

      {/* Global search overlay (Ctrl/Cmd+Space) */}
      <GlobalSearch />

      {/* System taskbar */}
      <Taskbar />

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}
