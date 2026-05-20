import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface DesktopIcon {
  appId: string;
  x: number;
  y: number;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  target: 'desktop' | 'icon' | 'taskbar' | null;
  targetId?: string;
}

interface DesktopState {
  wallpaper: string;
  icons: DesktopIcon[];
  taskbarApps: string[];
  contextMenu: ContextMenuState;

  // Actions
  setWallpaper: (wallpaper: string) => void;
  setIcons: (icons: DesktopIcon[]) => void;
  moveIcon: (appId: string, x: number, y: number) => void;
  addToTaskbar: (appId: string) => void;
  removeFromTaskbar: (appId: string) => void;
  showContextMenu: (state: Omit<ContextMenuState, 'visible'>) => void;
  hideContextMenu: () => void;
  setLayout: (wallpaper: string, icons: DesktopIcon[], taskbarApps: string[]) => void;
}

export const useDesktopStore = create<DesktopState>()(
  devtools(
    (set) => ({
      wallpaper: 'default-gradient',
      icons: [],
      taskbarApps: ['file-explorer', 'terminal', 'text-editor', 'settings'],
      contextMenu: {
        visible: false,
        x: 0,
        y: 0,
        target: null,
      },

      setWallpaper: (wallpaper) => set({ wallpaper }),

      setIcons: (icons) => set({ icons }),

      moveIcon: (appId, x, y) =>
        set((state) => ({
          icons: state.icons.map((icon) =>
            icon.appId === appId ? { ...icon, x, y } : icon
          ),
        })),

      addToTaskbar: (appId) =>
        set((state) => ({
          taskbarApps: state.taskbarApps.includes(appId)
            ? state.taskbarApps
            : [...state.taskbarApps, appId],
        })),

      removeFromTaskbar: (appId) =>
        set((state) => ({
          taskbarApps: state.taskbarApps.filter((id) => id !== appId),
        })),

      showContextMenu: (menuState) =>
        set({ contextMenu: { ...menuState, visible: true } }),

      hideContextMenu: () =>
        set((state) => ({
          contextMenu: { ...state.contextMenu, visible: false },
        })),

      setLayout: (wallpaper, icons, taskbarApps) =>
        set({ wallpaper, icons, taskbarApps }),
    }),
    { name: 'desktop-store' }
  )
);
