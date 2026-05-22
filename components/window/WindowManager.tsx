'use client';

import { Suspense } from 'react';
import { useWindowStore } from '@/store/window.store';
import { WindowFrame } from './WindowFrame';
import { appRegistry } from '@/registry/app-registry';

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <>
      {windows.map((win) => {
        const app = appRegistry.get(win.appId);
        if (!app) return null;

        return (
          <Suspense key={win.instanceId} fallback={null}>
            <WindowFrame window={win} app={app} />
          </Suspense>
        );
      })}
    </>
  );
}
