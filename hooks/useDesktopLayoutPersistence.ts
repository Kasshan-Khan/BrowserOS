'use client';

import { useEffect, useRef } from 'react';
import { useDesktopStore } from '@/store/desktop.store';

const DEBOUNCE_MS = 1500;

/**
 * Debounced persistence of desktop layout (icons + taskbar) to server.
 * Wallpaper changes are saved immediately in the Settings component.
 */
export function useDesktopLayoutPersistence() {
  const icons = useDesktopStore((s) => s.icons);
  const taskbarApps = useDesktopStore((s) => s.taskbarApps);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // Skip initial render (avoid overwriting server state on mount)
    if (!initialized.current) {
      initialized.current = true;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/desktop/layout', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ iconLayout: icons, taskbarApps }),
        });
      } catch {
        // Non-critical
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [icons, taskbarApps]);
}
