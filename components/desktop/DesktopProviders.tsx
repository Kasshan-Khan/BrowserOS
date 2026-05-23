'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { registerBuiltinApps } from '@/registry';
import type { SessionPayload } from '@/types/auth';

// Register apps once
let appsRegistered = false;

interface Props {
  session: SessionPayload;
  children: React.ReactNode;
}

export function DesktopProviders({ session, children }: Props) {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    // Hydrate auth store from server session
    setUser({
      id: session.userId,
      email: session.email,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      avatarUrl: session.avatarUrl,
    });

    // Register apps (idempotent)
    if (!appsRegistered) {
      registerBuiltinApps();
      appsRegistered = true;
    }
  }, [session, setUser]);

  return <>{children}</>;
}
