import type { ComponentType, LazyExoticComponent } from 'react';

// ─── App definition ───────────────────────────────────────────────────────────

export interface AppDefinition {
  /** Unique application identifier */
  id: string;
  /** Display name shown in taskbar and title bar */
  name: string;
  /** Icon component or URL */
  icon: string;
  /** Description for search/launcher */
  description: string;
  /** Default window dimensions */
  defaultSize: { width: number; height: number };
  /** Minimum window dimensions */
  minSize?: { width: number; height: number };
  /** Whether multiple instances can be opened */
  allowMultiple?: boolean;
  /** Lazy-loaded component */
  component: LazyExoticComponent<ComponentType<AppWindowProps>>;
  /** Categories for search indexing */
  categories?: string[];
  /** Keyboard shortcut to open */
  shortcut?: string;
}

export interface AppWindowProps {
  /** Window instance ID */
  instanceId: string;
  /** App-specific state persisted in DB */
  appState: Record<string, unknown>;
  /** Update app state (persisted) */
  onStateChange: (state: Record<string, unknown>) => void;
  /** Close this window */
  onClose: () => void;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class AppRegistry {
  private apps = new Map<string, AppDefinition>();

  register(app: AppDefinition): void {
    if (this.apps.has(app.id)) {
      console.warn(`[AppRegistry] App "${app.id}" is already registered. Overwriting.`);
    }
    this.apps.set(app.id, app);
  }

  unregister(appId: string): void {
    this.apps.delete(appId);
  }

  get(appId: string): AppDefinition | undefined {
    return this.apps.get(appId);
  }

  getAll(): AppDefinition[] {
    return Array.from(this.apps.values());
  }

  search(query: string): AppDefinition[] {
    const q = query.toLowerCase();
    return this.getAll().filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.categories?.some((c) => c.toLowerCase().includes(q))
    );
  }
}

// Singleton
export const appRegistry = new AppRegistry();
