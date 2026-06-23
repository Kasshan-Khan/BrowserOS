'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { appRegistry } from '@/registry/app-registry';
import { useWindowStore } from '@/store/window.store';
import { v4 as uuidv4 } from 'uuid';

interface SearchResult {
  type: 'app' | 'file' | 'setting';
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openWindow = useWindowStore((s) => s.openWindow);

  // Keyboard shortcut to open (Cmd/Ctrl + Space)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ' ') {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search logic
  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }

      const searchResults: SearchResult[] = [];

      // App search (instant, local)
      const apps = appRegistry.search(q);
      for (const app of apps) {
        searchResults.push({
          type: 'app',
          id: app.id,
          label: app.name,
          description: app.description,
          icon: app.icon,
          action: () => {
            openWindow({
              instanceId: uuidv4(),
              appId: app.id,
              title: app.name,
              x: 120,
              y: 80,
              width: app.defaultSize.width,
              height: app.defaultSize.height,
              isMinimized: false,
              isMaximized: false,
              appState: {},
            });
            setIsOpen(false);
          },
        });
      }

      // File search (async)
      try {
        const res = await fetch(`/api/fs?q=${encodeURIComponent(q)}&limit=5`, {
          credentials: 'include',
        });
        if (res.ok) {
          const { data } = await res.json();
          for (const node of data.nodes ?? []) {
            searchResults.push({
              type: 'file',
              id: node.id,
              label: node.name,
              description: node.path,
              icon: node.type === 'DIRECTORY' ? '📁' : '📄',
              action: () => {
                openWindow({
                  instanceId: uuidv4(),
                  appId: 'file-explorer',
                  title: 'File Explorer',
                  x: 120,
                  y: 80,
                  width: 900,
                  height: 600,
                  isMinimized: false,
                  isMaximized: false,
                  appState: { openNodeId: node.id },
                });
                setIsOpen(false);
              },
            });
          }
        }
      } catch {
        // Search failures are non-critical
      }

      setResults(searchResults.slice(0, 10));
      setSelectedIndex(0);
    },
    [openWindow]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 150); // debounce
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      results[selectedIndex].action();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(17,17,27,0.95)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3 gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-lg">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search apps, files, settings…"
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: '#cdd6f4' }}
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#6c7086' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="py-2 max-h-80 overflow-auto">
            {results.map((result, i) => (
              <button
                key={result.id}
                onClick={result.action}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  background: i === selectedIndex ? 'rgba(137,180,250,0.12)' : 'transparent',
                  color: '#cdd6f4',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-xl w-8 text-center flex-shrink-0">{result.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{result.label}</p>
                  {result.description && (
                    <p className="text-xs truncate" style={{ color: '#6c7086' }}>
                      {result.description}
                    </p>
                  )}
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#6c7086' }}
                >
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        )}

        {query && results.length === 0 && (
          <div className="py-8 text-center text-sm" style={{ color: '#6c7086' }}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!query && (
          <div className="py-4 px-4 text-xs" style={{ color: '#6c7086' }}>
            <span className="mr-4">↑↓ Navigate</span>
            <span className="mr-4">↵ Open</span>
            <span>ESC Close</span>
          </div>
        )}
      </div>
    </div>
  );
}
