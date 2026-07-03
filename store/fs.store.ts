import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';

enableMapSet();

export interface FsNodeClient {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  parentId: string | null;
  path: string;
  mimeType: string | null;
  size: number;
  createdAt: string;
  updatedAt: string;
}

interface FsState {
  nodes: Map<string, FsNodeClient>;
  currentDirectoryId: string | null;
  selectedNodeIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  setNodes: (nodes: FsNodeClient[]) => void;
  addNode: (node: FsNodeClient) => void;
  updateNode: (id: string, updates: Partial<FsNodeClient>) => void;
  removeNode: (id: string) => void;
  setCurrentDirectory: (id: string | null) => void;
  selectNode: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed
  getCurrentChildren: () => FsNodeClient[];
}

export const useFsStore = create<FsState>()(
  devtools(
    immer((set, get) => ({
      nodes: new Map(),
      currentDirectoryId: null,
      selectedNodeIds: new Set(),
      isLoading: false,
      error: null,

      setNodes: (nodes) => {
        set((state) => {
          state.nodes = new Map(nodes.map((n) => [n.id, n]));
        });
      },

      addNode: (node) => {
        set((state) => {
          state.nodes.set(node.id, node);
        });
      },

      updateNode: (id, updates) => {
        set((state) => {
          const existing = state.nodes.get(id);
          if (existing) {
            state.nodes.set(id, { ...existing, ...updates });
          }
        });
      },

      removeNode: (id) => {
        set((state) => {
          state.nodes.delete(id);
          state.selectedNodeIds.delete(id);
        });
      },

      setCurrentDirectory: (id) => {
        set((state) => {
          state.currentDirectoryId = id;
          state.selectedNodeIds = new Set();
        });
      },

      selectNode: (id, multi = false) => {
        set((state) => {
          if (!multi) {
            state.selectedNodeIds = new Set([id]);
          } else if (state.selectedNodeIds.has(id)) {
            state.selectedNodeIds.delete(id);
          } else {
            state.selectedNodeIds.add(id);
          }
        });
      },

      clearSelection: () => {
        set((state) => {
          state.selectedNodeIds = new Set();
        });
      },

      setLoading: (isLoading) => set((state) => { state.isLoading = isLoading; }),

      setError: (error) => set((state) => { state.error = error; }),

      getCurrentChildren: () => {
        const { nodes, currentDirectoryId } = get();
        return Array.from(nodes.values())
          .filter((n) => n.parentId === currentDirectoryId)
          .sort((a, b) => {
            // Directories first, then alphabetical
            if (a.type !== b.type) return a.type === 'DIRECTORY' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
      },
    })),
    { name: 'fs-store' }
  )
);
