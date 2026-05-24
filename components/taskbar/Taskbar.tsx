'use client';

import { useState, useEffect } from 'react';
import { useDesktopStore } from '@/store/desktop.store';
import { useWindowStore } from '@/store/window.store';
import { appRegistry } from '@/registry/app-registry';
import { v4 as uuidv4 } from 'uuid';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { Clock } from './Clock';
import { SystemTray } from './SystemTray';

export function Taskbar() {
  const { taskbarApps } = useDesktopStore();
  const windows = useWindowStore((s) => s.windows);
  const { openWindow, focusWindow, minimizeWindow, restoreWindow } = useWindowStore();
  const router = useRouter();

  function handleAppClick(appId: string) {
    const app = appRegistry.get(appId);
    if (!app) return;

    // Check for existing windows of this app
    const appWindows = windows.filter((w) => w.appId === appId);

    if (appWindows.length === 0) {
      // Open new window
      openWindow({
        instanceId: uuidv4(),
        appId,
        title: app.name,
        x: 120 + Math.random() * 80,
        y: 80 + Math.random() * 60,
        width: app.defaultSize.width,
        height: app.defaultSize.height,
        isMinimized: false,
        isMaximized: false,
        appState: {},
      });
    } else if (appWindows.length === 1) {
      const win = appWindows[0];
      if (win.isMinimized) {
        restoreWindow(win.instanceId);
      } else {
        minimizeWindow(win.instanceId);
      }
    } else {
      // Multiple windows — focus the last one
      const last = appWindows[appWindows.length - 1];
      if (last.isMinimized) restoreWindow(last.instanceId);
      else focusWindow(last.instanceId);
    }
  }

  return (
    <div className="taskbar" role="toolbar" aria-label="Taskbar">
      {/* App launcher button */}
      <TaskbarButton
        icon="🚀"
        label="Launcher"
        isActive={false}
        onClick={() => {
          const settingsApp = appRegistry.get('settings');
          if (settingsApp) {
            openWindow({
              instanceId: uuidv4(),
              appId: 'settings',
              title: 'Settings',
              x: 120,
              y: 80,
              width: settingsApp.defaultSize.width,
              height: settingsApp.defaultSize.height,
              isMinimized: false,
              isMaximized: false,
              appState: {},
            });
          }
        }}
      />

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

      {/* Pinned apps */}
      {taskbarApps.map((appId) => {
        const app = appRegistry.get(appId);
        if (!app) return null;

        const appWindows = windows.filter((w) => w.appId === appId);
        const isActive = appWindows.some((w) => !w.isMinimized);
        const hasWindows = appWindows.length > 0;

        return (
          <TaskbarButton
            key={appId}
            icon={app.icon}
            label={app.name}
            isActive={isActive}
            hasWindows={hasWindows}
            onClick={() => handleAppClick(appId)}
          />
        );
      })}

      {/* Running apps not in taskbar */}
      {windows
        .filter((w) => !taskbarApps.includes(w.appId))
        .reduce((unique: string[], w) => {
          if (!unique.includes(w.appId)) unique.push(w.appId);
          return unique;
        }, [])
        .map((appId) => {
          const app = appRegistry.get(appId);
          if (!app) return null;
          const appWindows = windows.filter((w) => w.appId === appId);
          const isActive = appWindows.some((w) => !w.isMinimized);

          return (
            <TaskbarButton
              key={`running-${appId}`}
              icon={app.icon}
              label={app.name}
              isActive={isActive}
              hasWindows={true}
              onClick={() => handleAppClick(appId)}
            />
          );
        })}

      <div className="flex-1" />

      {/* System tray */}
      <SystemTray />

      {/* Clock */}
      <Clock />
    </div>
  );
}

interface TaskbarButtonProps {
  icon: string;
  label: string;
  isActive: boolean;
  hasWindows?: boolean;
  onClick: () => void;
}

function TaskbarButton({ icon, label, isActive, hasWindows, onClick }: TaskbarButtonProps) {
  return (
    <div className="relative group" title={label}>
      <button
        onClick={onClick}
        className="relative w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:bg-white/10 active:bg-white/20"
        style={{
          background: isActive ? 'rgba(137,180,250,0.15)' : 'transparent',
        }}
        aria-label={label}
      >
        {icon}
        {/* Active indicator dot */}
        {hasWindows && (
          <span
            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
            style={{ background: isActive ? '#89b4fa' : '#6c7086' }}
          />
        )}
      </button>

      {/* Tooltip */}
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: 'rgba(17,17,27,0.9)', color: '#cdd6f4', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {label}
      </div>
    </div>
  );
}
