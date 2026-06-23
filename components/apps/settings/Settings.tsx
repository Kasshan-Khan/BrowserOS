'use client';

import { useState } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';
import { useDesktopStore } from '@/store/desktop.store';
import { useAuthStore } from '@/store/auth.store';
import { WALLPAPERS } from '@/components/desktop/Wallpaper';
import { appRegistry } from '@/registry/app-registry';

type Section = 'appearance' | 'desktop' | 'account' | 'about';

export default function Settings({ instanceId, appState, onStateChange }: AppWindowProps) {
  const [section, setSection] = useState<Section>((appState.section as Section) ?? 'appearance');
  const { wallpaper, setWallpaper, taskbarApps, addToTaskbar, removeFromTaskbar } = useDesktopStore();
  const user = useAuthStore((s) => s.user);
  const [saveMsg, setSaveMsg] = useState('');

  async function saveWallpaper(wp: string) {
    setWallpaper(wp);
    await fetch('/api/desktop/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ wallpaper: wp }),
    });
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
  }

  const navItems: { id: Section; icon: string; label: string }[] = [
    { id: 'appearance', icon: '🎨', label: 'Appearance' },
    { id: 'desktop', icon: '🖥️', label: 'Desktop' },
    { id: 'account', icon: '👤', label: 'Account' },
    { id: 'about', icon: 'ℹ️', label: 'About' },
  ];

  return (
    <div className="flex h-full" style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
      {/* Sidebar */}
      <div
        className="w-48 flex flex-col flex-shrink-0 py-2"
        style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="px-4 py-2 text-sm font-semibold" style={{ color: '#6c7086' }}>
          SETTINGS
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { setSection(item.id); onStateChange({ ...appState, section: item.id }); }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/10 rounded-lg mx-2"
            style={{
              background: section === item.id ? 'rgba(137,180,250,0.15)' : 'transparent',
              color: section === item.id ? '#89b4fa' : '#cdd6f4',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {saveMsg && (
          <div className="mb-4 text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(166,227,161,0.15)', color: '#a6e3a1' }}>
            {saveMsg}
          </div>
        )}

        {section === 'appearance' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: '#6c7086' }}>WALLPAPER</h3>
              <div className="grid grid-cols-2 gap-3">
                {WALLPAPERS.map((wp) => (
                  <button
                    key={wp.id}
                    onClick={() => saveWallpaper(wp.id)}
                    className="relative rounded-xl overflow-hidden transition-all hover:scale-105"
                    style={{
                      height: 80,
                      background: wp.preview,
                      outline: wallpaper === wp.id ? '2px solid #89b4fa' : '2px solid transparent',
                      outlineOffset: 2,
                    }}
                  >
                    <span className="absolute bottom-2 left-2 text-xs font-medium text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {wp.name}
                    </span>
                    {wallpaper === wp.id && (
                      <span className="absolute top-2 right-2 text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'desktop' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Desktop</h2>
            <div>
              <h3 className="text-sm font-medium mb-3" style={{ color: '#6c7086' }}>TASKBAR APPS</h3>
              <div className="space-y-2">
                {appRegistry.getAll().map((app) => {
                  const isPinned = taskbarApps.includes(app.id);
                  return (
                    <div key={app.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="flex items-center gap-3">
                        <span>{app.icon}</span>
                        <span className="text-sm">{app.name}</span>
                      </div>
                      <button
                        onClick={() => isPinned ? removeFromTaskbar(app.id) : addToTaskbar(app.id)}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{
                          background: isPinned ? 'rgba(243,139,168,0.15)' : 'rgba(137,180,250,0.15)',
                          color: isPinned ? '#f38ba8' : '#89b4fa',
                        }}
                      >
                        {isPinned ? 'Unpin' : 'Pin'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {section === 'account' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Account</h2>
            {user && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
                    style={{ background: '#89b4fa', color: '#1e1e2e' }}
                  >
                    {user.displayName[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-sm" style={{ color: '#6c7086' }}>@{user.username}</p>
                    <p className="text-sm" style={{ color: '#6c7086' }}>{user.email}</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: '#6c7086' }}>
                  Role: <span style={{ color: '#89b4fa' }}>{user.role}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'about' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">About BrowserOS</h2>
            <div className="space-y-3 text-sm" style={{ color: '#6c7086' }}>
              <div className="flex items-center gap-3">
                <span className="text-4xl">💻</span>
                <div>
                  <p className="text-base font-semibold" style={{ color: '#cdd6f4' }}>BrowserOS</p>
                  <p>Version 0.1.0</p>
                </div>
              </div>
              <div className="pt-4 space-y-2 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p>Built with Next.js 15, TypeScript, TailwindCSS</p>
                <p>PostgreSQL + Prisma · Redis · Socket.IO</p>
                <p>Zustand · Argon2id</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
