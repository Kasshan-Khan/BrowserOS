'use client';

import { useEffect, useRef } from 'react';
import { useWindowStore } from '@/store/window.store';

const DEBOUNCE_MS = 2000;

/**
 * Persists window states to the server with debouncing.
 * Called once at the desktop level.
 */
export function useWindowPersistence() {
  const windows = useWindowStore((s) => s.windows);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWindowsRef = useRef(windows);

  useEffect(() => {
    // Skip if nothing changed
    if (prevWindowsRef.current === windows) return;
    prevWindowsRef.current = windows;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/desktop/windows', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ windows }),
        });
      } catch {
        // Non-critical — window state will be re-loaded on next session
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [windows]);
}
