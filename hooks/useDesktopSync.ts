'use client';

import { useEffect } from 'react';
import { useDesktopStore } from '@/store/desktop.store';

export function useDesktopSync() {
  const setLayout = useDesktopStore((s) => s.setLayout);
  const setWallpaper = useDesktopStore((s) => s.setWallpaper);

  // Load layout from server on mount
  useEffect(() => {
    async function loadLayout() {
      try {
        const res = await fetch('/api/desktop/layout', { credentials: 'include' });
        if (res.ok) {
          const { data } = await res.json();
          const { layout } = data;
          setLayout(
            layout.wallpaper ?? 'default-gradient',
            layout.iconLayout ?? [],
            layout.taskbarApps ?? ['file-explorer', 'terminal', 'text-editor', 'settings']
          );
        }
      } catch {
        // Use defaults
      }
    }
    loadLayout();
  }, [setLayout]);

  // Save layout changes with debounce
  // (handled per-component to avoid over-fetching)
}
