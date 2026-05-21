'use client';

import { useEffect, useState } from 'react';

export interface ToastData {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}

// Simple global toast event bus
const listeners: ((toast: ToastData) => void)[] = [];

export function showToast(toast: Omit<ToastData, 'id'>) {
  const data: ToastData = { ...toast, id: crypto.randomUUID() };
  listeners.forEach((fn) => fn(data));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    function handler(toast: ToastData) {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration ?? 3000);
    }

    listeners.push(handler);
    return () => {
      const idx = listeners.indexOf(handler);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  if (toasts.length === 0) return null;

  const colors: Record<ToastData['type'], { bg: string; border: string; icon: string }> = {
    info: { bg: 'rgba(137,180,250,0.15)', border: 'rgba(137,180,250,0.3)', icon: 'ℹ️' },
    success: { bg: 'rgba(166,227,161,0.15)', border: 'rgba(166,227,161,0.3)', icon: '✓' },
    error: { bg: 'rgba(243,139,168,0.15)', border: 'rgba(243,139,168,0.3)', icon: '✕' },
    warning: { bg: 'rgba(249,226,175,0.15)', border: 'rgba(249,226,175,0.3)', icon: '⚠' },
  };

  return (
    <div className="fixed bottom-16 right-4 z-[9999] flex flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const style = colors[toast.type];
        return (
          <div
            key={toast.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm max-w-xs"
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              backdropFilter: 'blur(20px)',
              color: '#cdd6f4',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              animation: 'slideInRight 0.2s ease',
            }}
            role="alert"
          >
            <span>{style.icon}</span>
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
