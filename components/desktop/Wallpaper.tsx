'use client';

import { useDesktopStore } from '@/store/desktop.store';

export const WALLPAPERS = [
  { id: 'default-gradient', name: 'Midnight', preview: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' },
  { id: 'aurora', name: 'Aurora', preview: 'linear-gradient(135deg, #0d1b2a, #1b4332, #081c15)' },
  { id: 'sunset', name: 'Sunset', preview: 'linear-gradient(135deg, #2d1b69, #c53030, #744210)' },
  { id: 'ocean', name: 'Ocean', preview: 'linear-gradient(135deg, #0c2340, #1a56a0, #0891b2)' },
] as const;

export type WallpaperId = typeof WALLPAPERS[number]['id'];

export function Wallpaper() {
  // This component is a data export — actual rendering via CSS class on Desktop
  return null;
}
