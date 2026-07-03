'use client';

import { useEffect, useRef } from 'react';
import { useDesktopStore } from '@/store/desktop.store';
import { useWindowStore } from '@/store/window.store';
import { appRegistry } from '@/registry/app-registry';
import { v4 as uuidv4 } from 'uuid';

export function DesktopContextMenu() {
  const { contextMenu, hideContextMenu, setWallpaper } = useDesktopStore();
  const openWindow = useWindowStore((s) => s.openWindow);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu.visible) return;

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu.visible, hideContextMenu]);

  if (!contextMenu.visible) return null;

  function openApp(appId: string) {
    const app = appRegistry.get(appId);
    if (!app) return;
    openWindow({
      instanceId: uuidv4(),
      appId,
      title: app.name,
      x: 120,
      y: 80,
      width: app.defaultSize.width,
      height: app.defaultSize.height,
      isMinimized: false,
      isMaximized: false,
      appState: {},
    });
    hideContextMenu();
  }

  // Adjust position to stay in viewport
  const menuWidth = 220;
  const menuHeight = 280;
  const x = Math.min(contextMenu.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(contextMenu.y, window.innerHeight - menuHeight - 56);

  return (
    <div
      ref={ref}
      className="fixed z-[9998] py-1 rounded-xl text-sm overflow-hidden"
      style={{
        left: x,
        top: y,
        width: menuWidth,
        background: 'rgba(17,17,27,0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        color: '#cdd6f4',
      }}
    >
      {contextMenu.target === 'desktop' && (
        <>
          <MenuSection label="Open" />
          <MenuItem icon="📁" label="File Explorer" onClick={() => openApp('file-explorer')} />
          <MenuItem icon="🖥️" label="Terminal" onClick={() => openApp('terminal')} />
          <MenuItem icon="📝" label="Text Editor" onClick={() => openApp('text-editor')} />
          <MenuDivider />
          <MenuSection label="Wallpaper" />
          <MenuItem icon="🌙" label="Midnight" onClick={() => { setWallpaper('default-gradient'); hideContextMenu(); }} />
          <MenuItem icon="🌿" label="Aurora" onClick={() => { setWallpaper('aurora'); hideContextMenu(); }} />
          <MenuItem icon="🌅" label="Sunset" onClick={() => { setWallpaper('sunset'); hideContextMenu(); }} />
          <MenuItem icon="🌊" label="Ocean" onClick={() => { setWallpaper('ocean'); hideContextMenu(); }} />
          <MenuDivider />
          <MenuItem icon="⚙️" label="Settings" onClick={() => openApp('settings')} />
          <MenuDivider />
          <MenuItem icon="🔄" label="Reset Layout" onClick={() => { useDesktopStore.getState().setIcons([]); hideContextMenu(); }} />
        </>
      )}

      {contextMenu.target === 'icon' && contextMenu.targetId && (
        <>
          {(() => {
            const app = appRegistry.get(contextMenu.targetId);
            return app ? (
              <>
                <MenuItem icon={app.icon} label={`Open ${app.name}`} onClick={() => openApp(app.id)} />
                <MenuDivider />
                <MenuItem icon="ℹ️" label="App info" onClick={hideContextMenu} />
              </>
            ) : null;
          })()}
        </>
      )}
    </div>
  );
}

function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: '#6c7086' }}>
      {label}
    </div>
  );
}

function MenuDivider() {
  return <div className="my-1 mx-2" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />;
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 flex items-center gap-2.5 rounded-lg mx-1 transition-colors hover:bg-white/10"
      style={{ color: danger ? '#f38ba8' : '#cdd6f4', width: 'calc(100% - 8px)' }}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
