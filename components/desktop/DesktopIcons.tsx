'use client';

import { useCallback, useRef } from 'react';
import { useDesktopStore, type DesktopIcon } from '@/store/desktop.store';
import { useWindowStore } from '@/store/window.store';
import { appRegistry } from '@/registry/app-registry';
import { v4 as uuidv4 } from 'uuid';

export function DesktopIcons() {
  const { icons, moveIcon, showContextMenu, hideContextMenu } = useDesktopStore();
  const openWindow = useWindowStore((s) => s.openWindow);

  // Default icon positions if none are saved
  const allApps = appRegistry.getAll();
  const displayIcons: DesktopIcon[] =
    icons.length > 0
      ? icons
      : allApps.map((app, i) => {
          const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
          const maxRows = Math.max(1, Math.floor((screenHeight - 100) / 90));
          const col = Math.floor(i / maxRows);
          const row = i % maxRows;
          return {
            appId: app.id,
            x: 20 + col * 90,
            y: 20 + row * 90,
          };
        });

  const handleDoubleClick = useCallback(
    (appId: string) => {
      const app = appRegistry.get(appId);
      if (!app) return;

      openWindow({
        instanceId: uuidv4(),
        appId,
        title: app.name,
        x: 100 + Math.random() * 100,
        y: 80 + Math.random() * 80,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        isMinimized: false,
        isMaximized: false,
        appState: {},
      });

      hideContextMenu();
    },
    [openWindow, hideContextMenu]
  );

  const handleIconContextMenu = useCallback(
    (e: React.MouseEvent, appId: string) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu({ x: e.clientX, y: e.clientY, target: 'icon', targetId: appId });
    },
    [showContextMenu]
  );

  return (
    <div className="absolute inset-0" style={{ bottom: 48 }}>
      {displayIcons.map((icon) => {
        const app = appRegistry.get(icon.appId);
        if (!app) return null;

        return (
          <DesktopIconItem
            key={icon.appId}
            icon={icon}
            app={app}
            onDoubleClick={() => handleDoubleClick(icon.appId)}
            onContextMenu={(e) => handleIconContextMenu(e, icon.appId)}
            onMove={(x, y) => moveIcon(icon.appId, x, y)}
          />
        );
      })}
    </div>
  );
}

interface DesktopIconItemProps {
  icon: DesktopIcon;
  app: ReturnType<typeof appRegistry.get> & {};
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMove: (x: number, y: number) => void;
}

function DesktopIconItem({ icon, app, onDoubleClick, onContextMenu, onMove }: DesktopIconItemProps) {
  const dragOffset = useRef({ x: 0, y: 0 });

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    let hasMoved = false;

    function handleMouseMove(e: MouseEvent) {
      hasMoved = true;
      onMove(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y
      );
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div
      className="absolute flex flex-col items-center gap-1 cursor-default select-none"
      style={{ left: icon.x, top: icon.y, width: 72 }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl transition-transform hover:scale-105 active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {app.icon}
      </div>
      <span
        className="text-xs text-center leading-tight px-1 rounded"
        style={{
          color: '#cdd6f4',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          maxWidth: 72,
          wordBreak: 'break-word',
        }}
      >
        {app.name}
      </span>
    </div>
  );
}
