import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface WindowInstance {
  instanceId: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  appState: Record<string, unknown>;
  // Snapshot before maximize (to restore)
  preMaximizeState?: { x: number; y: number; width: number; height: number };
}

interface WindowStore {
  windows: WindowInstance[];
  maxZIndex: number;

  // Actions
  openWindow: (window: Omit<WindowInstance, 'zIndex'>) => void;
  closeWindow: (instanceId: string) => void;
  focusWindow: (instanceId: string) => void;
  minimizeWindow: (instanceId: string) => void;
  restoreWindow: (instanceId: string) => void;
  maximizeWindow: (instanceId: string) => void;
  unmaximizeWindow: (instanceId: string) => void;
  moveWindow: (instanceId: string, x: number, y: number) => void;
  resizeWindow: (instanceId: string, width: number, height: number, x?: number, y?: number) => void;
  updateAppState: (instanceId: string, appState: Record<string, unknown>) => void;
  updateTitle: (instanceId: string, title: string) => void;
  setWindows: (windows: WindowInstance[]) => void;
}

const BASE_Z = 100;

export const useWindowStore = create<WindowStore>()(
  devtools(
    immer((set, get) => ({
      windows: [],
      maxZIndex: BASE_Z,

      openWindow: (windowDef) => {
        const { maxZIndex, windows } = get();

        // Prevent duplicate single-instance apps
        const existing = windows.find(
          (w) => w.appId === windowDef.appId && !w.isMinimized
        );
        if (existing) {
          // Focus instead of opening new
          set((state) => {
            const target = state.windows.find((w) => w.instanceId === existing.instanceId);
            if (target) {
              state.maxZIndex += 1;
              target.zIndex = state.maxZIndex;
              target.isMinimized = false;
            }
          });
          return;
        }

        const newZ = maxZIndex + 1;
        set((state) => {
          state.maxZIndex = newZ;
          state.windows.push({ ...windowDef, zIndex: newZ });
        });
      },

      closeWindow: (instanceId) => {
        set((state) => {
          state.windows = state.windows.filter((w) => w.instanceId !== instanceId);
        });
      },

      focusWindow: (instanceId) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target) {
            state.maxZIndex += 1;
            target.zIndex = state.maxZIndex;
            target.isMinimized = false;
          }
        });
      },

      minimizeWindow: (instanceId) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target) target.isMinimized = true;
        });
      },

      restoreWindow: (instanceId) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target) {
            target.isMinimized = false;
            state.maxZIndex += 1;
            target.zIndex = state.maxZIndex;
          }
        });
      },

      maximizeWindow: (instanceId) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target && !target.isMaximized) {
            target.preMaximizeState = {
              x: target.x,
              y: target.y,
              width: target.width,
              height: target.height,
            };
            target.isMaximized = true;
            state.maxZIndex += 1;
            target.zIndex = state.maxZIndex;
          }
        });
      },

      unmaximizeWindow: (instanceId) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target && target.isMaximized && target.preMaximizeState) {
            const prev = target.preMaximizeState;
            target.isMaximized = false;
            target.x = prev.x;
            target.y = prev.y;
            target.width = prev.width;
            target.height = prev.height;
            target.preMaximizeState = undefined;
          }
        });
      },

      moveWindow: (instanceId, x, y) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target && !target.isMaximized) {
            target.x = x;
            target.y = y;
          }
        });
      },

      resizeWindow: (instanceId, width, height, x, y) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target && !target.isMaximized) {
            target.width = width;
            target.height = height;
            if (x !== undefined) target.x = x;
            if (y !== undefined) target.y = y;
          }
        });
      },

      updateAppState: (instanceId, appState) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target) target.appState = appState;
        });
      },

      updateTitle: (instanceId, title) => {
        set((state) => {
          const target = state.windows.find((w) => w.instanceId === instanceId);
          if (target) target.title = title;
        });
      },

      setWindows: (windows) => {
        set((state) => {
          state.windows = windows;
          state.maxZIndex = Math.max(BASE_Z, ...windows.map((w) => w.zIndex));
        });
      },
    })),
    { name: 'window-store' }
  )
);
