'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useWindowStore, type WindowInstance } from '@/store/window.store';
import { appRegistry, type AppDefinition } from '@/registry/app-registry';

interface Props {
  window: WindowInstance;
  app: AppDefinition;
}

const TASKBAR_HEIGHT = 48;
const TITLEBAR_HEIGHT = 32;
const MIN_VISIBLE = 100; // px that must remain on screen

export function WindowFrame({ window: win, app }: Props) {
  const {
    closeWindow,
    focusWindow,
    minimizeWindow,
    maximizeWindow,
    unmaximizeWindow,
    moveWindow,
    resizeWindow,
    updateAppState,
  } = useWindowStore();

  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, winX: 0, winY: 0 });
  const resizeRef = useRef({ resizing: false, edge: '', startX: 0, startY: 0, winX: 0, winY: 0, winW: 0, winH: 0 });

  // ─── Compute actual window style ──────────────────────────────────────────
  const style: React.CSSProperties = win.isMaximized
    ? {
        left: 0,
        top: 0,
        width: '100vw',
        height: `calc(100vh - ${TASKBAR_HEIGHT}px)`,
        borderRadius: 0,
        zIndex: win.zIndex,
      }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  if (win.isMinimized) {
    style.display = 'none';
  }

  // ─── Drag (title bar) ────────────────────────────────────────────────────

  const handleTitleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return;
      if ((e.target as HTMLElement).closest('.traffic-light')) return;

      focusWindow(win.instanceId);
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y,
      };

      function handleMouseMove(e: MouseEvent) {
        if (!dragRef.current.dragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newX = Math.max(-win.width + MIN_VISIBLE, dragRef.current.winX + dx);
        const newY = Math.max(0, Math.min(dragRef.current.winY + dy, globalThis.innerHeight - TASKBAR_HEIGHT - TITLEBAR_HEIGHT));
        moveWindow(win.instanceId, newX, newY);
      }

      function handleMouseUp() {
        dragRef.current.dragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [win, focusWindow, moveWindow]
  );

  // ─── Resize ──────────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, edge: string) => {
      e.stopPropagation();
      if (win.isMaximized) return;

      focusWindow(win.instanceId);
      resizeRef.current = {
        resizing: true,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y,
        winW: win.width,
        winH: win.height,
      };

      const minW = app.minSize?.width ?? 300;
      const minH = app.minSize?.height ?? 200;

      function handleMouseMove(e: MouseEvent) {
        if (!resizeRef.current.resizing) return;
        const { edge, startX, startY, winX, winY, winW, winH } = resizeRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newX = winX, newY = winY, newW = winW, newH = winH;

        if (edge.includes('e')) newW = Math.max(minW, winW + dx);
        if (edge.includes('s')) newH = Math.max(minH, winH + dy);
        if (edge.includes('w')) {
          newW = Math.max(minW, winW - dx);
          newX = winX + (winW - newW);
        }
        if (edge.includes('n')) {
          newH = Math.max(minH, winH - dy);
          newY = winY + (winH - newH);
        }

        resizeWindow(win.instanceId, newW, newH, newX, newY);
      }

      function handleMouseUp() {
        resizeRef.current.resizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [win, app, focusWindow, resizeWindow]
  );

  // ─── Double-click title bar to maximize ──────────────────────────────────

  const handleTitleBarDoubleClick = useCallback(() => {
    if (win.isMaximized) {
      unmaximizeWindow(win.instanceId);
    } else {
      maximizeWindow(win.instanceId);
    }
  }, [win, maximizeWindow, unmaximizeWindow]);

  const AppComponent = app.component;

  return (
    <div
      ref={frameRef}
      className={`window-container ${!win.isMinimized ? 'focused' : ''}`}
      style={style}
      onMouseDown={() => focusWindow(win.instanceId)}
    >
      {/* Title bar */}
      <div
        className="window-titlebar"
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={handleTitleBarDoubleClick}
      >
        {/* Traffic lights */}
        <div className="window-traffic-lights">
          <button
            className="traffic-light close"
            onClick={() => closeWindow(win.instanceId)}
            title="Close"
          >×</button>
          <button
            className="traffic-light minimize"
            onClick={() => minimizeWindow(win.instanceId)}
            title="Minimize"
          >−</button>
          <button
            className="traffic-light maximize"
            onClick={() => win.isMaximized ? unmaximizeWindow(win.instanceId) : maximizeWindow(win.instanceId)}
            title={win.isMaximized ? 'Restore' : 'Maximize'}
          >+</button>
        </div>

        {/* Title */}
        <span
          className="flex-1 text-center text-xs font-medium truncate"
          style={{ color: '#cdd6f4', pointerEvents: 'none' }}
        >
          {win.title}
        </span>

        {/* App icon */}
        <span className="text-sm flex-shrink-0">{app.icon}</span>
      </div>

      {/* App content */}
      <div className="window-content">
        <AppComponent
          instanceId={win.instanceId}
          appState={win.appState}
          onStateChange={(state) => updateAppState(win.instanceId, state)}
          onClose={() => closeWindow(win.instanceId)}
        />
      </div>

      {/* Resize handles */}
      {!win.isMaximized && (
        <>
          <ResizeHandle edge="n" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="s" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="e" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="w" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="ne" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="nw" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="se" onMouseDown={handleResizeMouseDown} />
          <ResizeHandle edge="sw" onMouseDown={handleResizeMouseDown} />
        </>
      )}
    </div>
  );
}

const RESIZE_CURSORS: Record<string, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
};

const RESIZE_STYLES: Record<string, React.CSSProperties> = {
  n:  { top: 0, left: 4, right: 4, height: 4 },
  s:  { bottom: 0, left: 4, right: 4, height: 4 },
  e:  { right: 0, top: 4, bottom: 4, width: 4 },
  w:  { left: 0, top: 4, bottom: 4, width: 4 },
  ne: { top: 0, right: 0, width: 8, height: 8 },
  nw: { top: 0, left: 0, width: 8, height: 8 },
  se: { bottom: 0, right: 0, width: 8, height: 8 },
  sw: { bottom: 0, left: 0, width: 8, height: 8 },
};

function ResizeHandle({
  edge,
  onMouseDown,
}: {
  edge: string;
  onMouseDown: (e: React.MouseEvent, edge: string) => void;
}) {
  return (
    <div
      className="absolute z-10"
      style={{ ...RESIZE_STYLES[edge], cursor: RESIZE_CURSORS[edge] }}
      onMouseDown={(e) => onMouseDown(e, edge)}
    />
  );
}
