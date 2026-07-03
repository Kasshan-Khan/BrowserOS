/**
 * Application registration entry point.
 * Import this file once in the client layout to register all built-in apps.
 */
import { lazy } from 'react';
import { appRegistry } from './app-registry';

// Lazy-load all apps for code splitting
const FileExplorer = lazy(() => import('@/components/apps/file-explorer/FileExplorer'));
const Terminal = lazy(() => import('@/components/apps/terminal/Terminal'));
const TextEditor = lazy(() => import('@/components/apps/text-editor/TextEditor'));
const Notes = lazy(() => import('@/components/apps/notes/Notes'));
const Calculator = lazy(() => import('@/components/apps/calculator/Calculator'));
const Settings = lazy(() => import('@/components/apps/settings/Settings'));
const Browser = lazy(() => import('@/components/apps/browser/Browser'));

export function registerBuiltinApps(): void {
  appRegistry.register({
    id: 'file-explorer',
    name: 'File Explorer',
    icon: '📁',
    description: 'Browse and manage your files and folders',
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 500, height: 350 },
    allowMultiple: true,
    component: FileExplorer,
    categories: ['files', 'documents', 'folders'],
    shortcut: 'Meta+E',
  });

  appRegistry.register({
    id: 'terminal',
    name: 'Terminal',
    icon: '🖥️',
    description: 'Command-line interface for your virtual filesystem',
    defaultSize: { width: 800, height: 500 },
    minSize: { width: 400, height: 300 },
    allowMultiple: true,
    component: Terminal,
    categories: ['terminal', 'shell', 'command'],
    shortcut: 'Meta+T',
  });

  appRegistry.register({
    id: 'text-editor',
    name: 'Text Editor',
    icon: '📝',
    description: 'Edit plain text and code files',
    defaultSize: { width: 900, height: 650 },
    minSize: { width: 500, height: 400 },
    allowMultiple: true,
    component: TextEditor,
    categories: ['editor', 'text', 'code', 'files'],
  });

  appRegistry.register({
    id: 'notes',
    name: 'Notes',
    icon: '🗒️',
    description: 'Quick notes and memos',
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 350, height: 300 },
    allowMultiple: false,
    component: Notes,
    categories: ['notes', 'memo', 'writing'],
  });

  appRegistry.register({
    id: 'calculator',
    name: 'Calculator',
    icon: '🧮',
    description: 'Basic and scientific calculator',
    defaultSize: { width: 320, height: 520 },
    minSize: { width: 280, height: 460 },
    allowMultiple: false,
    component: Calculator,
    categories: ['calculator', 'math'],
  });

  appRegistry.register({
    id: 'settings',
    name: 'Settings',
    icon: '⚙️',
    description: 'System preferences and account settings',
    defaultSize: { width: 850, height: 600 },
    minSize: { width: 600, height: 450 },
    allowMultiple: false,
    component: Settings,
    categories: ['settings', 'preferences', 'system', 'account'],
    shortcut: 'Meta+,',
  });

  appRegistry.register({
    id: 'browser',
    name: 'Browser',
    icon: '🌐',
    description: 'Surf the web within BrowserOS',
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 600, height: 400 },
    allowMultiple: true,
    component: Browser,
    categories: ['browser', 'web', 'internet'],
  });
}
