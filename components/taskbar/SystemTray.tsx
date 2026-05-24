'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

export function SystemTray() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      logout();
      router.push('/login');
    } catch {
      // Still logout locally
      logout();
      router.push('/login');
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
        style={{ color: '#cdd6f4' }}
        aria-label="User menu"
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: '#89b4fa', color: '#1e1e2e' }}
        >
          {user?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
      </button>

      {showMenu && (
        <div
          className="absolute bottom-full right-0 mb-2 rounded-xl py-1 min-w-[180px]"
          style={{
            background: 'rgba(17,17,27,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-sm font-medium" style={{ color: '#cdd6f4' }}>
              {user?.displayName}
            </p>
            <p className="text-xs" style={{ color: '#6c7086' }}>
              {user?.email}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-white/10 flex items-center gap-2"
            style={{ color: '#f38ba8' }}
          >
            <span>↪</span>
            Sign out
          </button>
        </div>
      )}

      {showMenu && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
