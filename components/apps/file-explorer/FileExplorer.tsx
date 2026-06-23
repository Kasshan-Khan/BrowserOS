'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';
import type { FsNodeClient } from '@/store/fs.store';

export default function FileExplorer({ instanceId, appState, onStateChange, onClose }: AppWindowProps) {
  const [nodes, setNodes] = useState<FsNodeClient[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(
    (appState.currentDirId as string) ?? null
  );
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'Home' },
  ]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const loadDirectory = useCallback(async (dirId: string | null) => {
    setIsLoading(true);
    try {
      const url = dirId ? `/api/fs?parentId=${dirId}` : '/api/fs';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const { data } = await res.json();
        setNodes(data.nodes ?? []);
      }
    } catch (err) {
      console.error('Failed to load directory', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(currentId);
  }, [currentId, loadDirectory]);

  function navigateTo(node: FsNodeClient) {
    if (node.type !== 'DIRECTORY') return;
    setCurrentId(node.id);
    setBreadcrumbs((prev) => [...prev, { id: node.id, name: node.name }]);
    onStateChange({ ...appState, currentDirId: node.id });
    setSelected(new Set());
  }

  function navigateToBreadcrumb(index: number) {
    const crumb = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentId(crumb.id);
    onStateChange({ ...appState, currentDirId: crumb.id });
    setSelected(new Set());
  }

  async function createNew(type: 'FILE' | 'DIRECTORY') {
    const name = type === 'FILE' ? 'New File.txt' : 'New Folder';
    try {
      const res = await fetch('/api/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, type, parentId: currentId }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setNodes((prev) => [...prev, data.node]);
        setRenaming(data.node.id);
        setRenameValue(name);
      }
    } catch (err) {
      console.error('Failed to create', err);
    }
  }

  async function deleteSelected() {
    for (const id of Array.from(selected)) {
      await fetch(`/api/fs/${id}`, { method: 'DELETE', credentials: 'include' });
    }
    setNodes((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  }

  async function commitRename(id: string) {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    try {
      const res = await fetch(`/api/fs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: renameValue }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setNodes((prev) => prev.map((n) => (n.id === id ? data.node : n)));
      }
    } catch (err) {
      console.error('Rename failed', err);
    } finally {
      setRenaming(null);
    }
  }

  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'DIRECTORY' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#1e1e2e', color: '#cdd6f4' }}
      onClick={() => { setContextMenu(null); setSelected(new Set()); }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => breadcrumbs.length > 1 && navigateToBreadcrumb(breadcrumbs.length - 2)}
          disabled={breadcrumbs.length <= 1}
          className="px-2 py-1 rounded text-sm disabled:opacity-30 hover:bg-white/10"
          title="Back"
        >←</button>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 flex-1 overflow-hidden">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span style={{ color: '#6c7086' }}>/</span>}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className="text-sm hover:underline truncate max-w-[120px]"
                style={{ color: i === breadcrumbs.length - 1 ? '#cdd6f4' : '#89b4fa' }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <button onClick={() => createNew('DIRECTORY')} className="px-2 py-1 rounded text-xs hover:bg-white/10" title="New Folder">📁+</button>
        <button onClick={() => createNew('FILE')} className="px-2 py-1 rounded text-xs hover:bg-white/10" title="New File">📄+</button>
        {selected.size > 0 && (
          <button onClick={deleteSelected} className="px-2 py-1 rounded text-xs hover:bg-red-500/20" style={{ color: '#f38ba8' }} title="Delete">🗑</button>
        )}
        <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className="px-2 py-1 rounded text-xs hover:bg-white/10">
          {viewMode === 'grid' ? '≡' : '⊞'}
        </button>
        <button onClick={() => loadDirectory(currentId)} className="px-2 py-1 rounded text-xs hover:bg-white/10" title="Refresh">↻</button>
      </div>

      {/* File grid/list */}
      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full" style={{ color: '#6c7086' }}>Loading…</div>
        ) : sortedNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: '#6c7086' }}>
            <span className="text-4xl">📭</span>
            <p className="text-sm">This folder is empty</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
            {sortedNodes.map((node) => (
              <FileGridItem
                key={node.id}
                node={node}
                isSelected={selected.has(node.id)}
                isRenaming={renaming === node.id}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameCommit={() => commitRename(node.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(e.ctrlKey || e.metaKey ? new Set([...Array.from(selected), node.id]) : new Set([node.id]));
                }}
                onDoubleClick={() => {
                  if (node.type === 'DIRECTORY') navigateTo(node);
                  else {
                    // Open in text editor
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
                  setSelected(new Set([node.id]));
                }}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedNodes.map((node) => (
              <FileListItem
                key={node.id}
                node={node}
                isSelected={selected.has(node.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(e.ctrlKey || e.metaKey ? new Set([...Array.from(selected), node.id]) : new Set([node.id]));
                }}
                onDoubleClick={() => node.type === 'DIRECTORY' && navigateTo(node)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="px-3 py-1 text-xs flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#6c7086' }}
      >
        {selected.size > 0 ? `${selected.size} selected` : `${sortedNodes.length} items`}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1 rounded-xl text-sm"
          style={{
            left: contextMenu.x, top: contextMenu.y,
            background: 'rgba(17,17,27,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxMenuItem label="Rename" onClick={() => { setRenaming(contextMenu.nodeId!); const n = nodes.find(x => x.id === contextMenu.nodeId); if (n) setRenameValue(n.name); setContextMenu(null); }} />
          <CtxMenuItem label="Delete" danger onClick={() => { deleteSelected(); setContextMenu(null); }} />
        </div>
      )}
    </div>
  );
}

function FileGridItem({ node, isSelected, isRenaming, renameValue, onRenameChange, onRenameCommit, onClick, onDoubleClick, onContextMenu }: {
  node: FsNodeClient;
  isSelected: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-default"
      style={{ background: isSelected ? 'rgba(137,180,250,0.15)' : 'transparent' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <span className="text-3xl">{node.type === 'DIRECTORY' ? '📁' : '📄'}</span>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCommit(); }}
          className="text-xs text-center w-full rounded px-1 outline-none"
          style={{ background: 'rgba(137,180,250,0.2)', color: '#cdd6f4', border: '1px solid #89b4fa' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-xs text-center leading-tight break-all" style={{ color: '#cdd6f4', maxWidth: 80 }}>
          {node.name}
        </span>
      )}
    </div>
  );
}

function FileListItem({ node, isSelected, onClick, onDoubleClick }: {
  node: FsNodeClient;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-default text-sm"
      style={{ background: isSelected ? 'rgba(137,180,250,0.15)' : 'transparent' }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span>{node.type === 'DIRECTORY' ? '📁' : '📄'}</span>
      <span className="flex-1 truncate" style={{ color: '#cdd6f4' }}>{node.name}</span>
      <span className="text-xs" style={{ color: '#6c7086' }}>
        {node.type === 'FILE' ? formatBytes(node.size) : ''}
      </span>
    </div>
  );
}

function CtxMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors"
      style={{ color: danger ? '#f38ba8' : '#cdd6f4' }}
    >
      {label}
    </button>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
