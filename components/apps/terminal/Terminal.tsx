'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';

interface TerminalLine {
  type: 'input' | 'output' | 'error';
  content: string;
}

interface VfsNode {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  parentId: string | null;
  content?: string;
  path: string;
  size: number;
}

export default function Terminal({ instanceId, appState, onStateChange }: AppWindowProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'output', content: 'BrowserOS Terminal v1.0' },
    { type: 'output', content: 'Type "help" for available commands.' },
    { type: 'output', content: '' },
  ]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState<string | null>((appState.cwd as string) ?? null);
  const [cwdPath, setCwdPath] = useState<string>('/');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load cwd path on mount
  useEffect(() => {
    if (cwd) {
      fetch(`/api/fs/${cwd}`, { credentials: 'include' })
        .then((r) => r.json())
        .then(({ data }) => data?.node && setCwdPath(data.node.path))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  function print(content: string, type: TerminalLine['type'] = 'output') {
    setLines((prev) => [...prev, { type, content }]);
  }

  async function execute(cmd: string) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    switch (command) {
      case 'help': {
        print('Available commands:');
        print('  pwd                  Print working directory');
        print('  ls [dir]             List directory contents');
        print('  cd <dir>             Change directory');
        print('  mkdir <name>         Create directory');
        print('  touch <name>         Create empty file');
        print('  rm <name>            Remove file or directory');
        print('  cat <file>           Print file contents');
        print('  mv <src> <dst>       Move/rename a node');
        print('  cp <src> <dst>       Copy a file');
        print('  clear                Clear the terminal');
        print('  help                 Show this help');
        break;
      }

      case 'pwd': {
        print(cwdPath || '/');
        break;
      }

      case 'ls': {
        try {
          const target = args[0];
          let dirId = cwd;

          if (target) {
            const nodes = await fetchChildren(cwd);
            const found = nodes.find((n) => n.name === target && n.type === 'DIRECTORY');
            if (!found) { print(`ls: ${target}: No such directory`, 'error'); break; }
            dirId = found.id;
          }

          const nodes = await fetchChildren(dirId);
          if (nodes.length === 0) {
            print('(empty)');
          } else {
            const dirs = nodes.filter((n) => n.type === 'DIRECTORY');
            const files = nodes.filter((n) => n.type === 'FILE');
            const output = [...dirs.map((n) => `\x1b[34m${n.name}/\x1b[0m`), ...files.map((n) => n.name)].join('  ');
            print(output);
          }
        } catch (err) {
          print(`ls: ${err}`, 'error');
        }
        break;
      }

      case 'cd': {
        const target = args[0];
        if (!target || target === '/') {
          setCwd(null);
          setCwdPath('/');
          onStateChange({ ...appState, cwd: null });
          break;
        }
        if (target === '..') {
          if (!cwd) { print('Already at root'); break; }
          const res = await fetch(`/api/fs/${cwd}`, { credentials: 'include' });
          const { data } = await res.json();
          if (data?.node?.parentId) {
            const parentRes = await fetch(`/api/fs/${data.node.parentId}`, { credentials: 'include' });
            const { data: parentData } = await parentRes.json();
            setCwd(data.node.parentId);
            setCwdPath(parentData?.node?.path ?? '/');
            onStateChange({ ...appState, cwd: data.node.parentId });
          } else {
            setCwd(null);
            setCwdPath('/');
            onStateChange({ ...appState, cwd: null });
          }
          break;
        }
        const nodes = await fetchChildren(cwd);
        const found = nodes.find((n) => n.name === target && n.type === 'DIRECTORY');
        if (!found) { print(`cd: ${target}: No such directory`, 'error'); break; }
        setCwd(found.id);
        setCwdPath(found.path);
        onStateChange({ ...appState, cwd: found.id });
        break;
      }

      case 'mkdir': {
        if (!args[0]) { print('mkdir: missing operand', 'error'); break; }
        try {
          const res = await fetch('/api/fs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: args[0], type: 'DIRECTORY', parentId: cwd ?? undefined }),
          });
          if (res.ok) print(`Created directory: ${args[0]}`);
          else { const d = await res.json(); print(d.error, 'error'); }
        } catch { print('mkdir failed', 'error'); }
        break;
      }

      case 'touch': {
        if (!args[0]) { print('touch: missing operand', 'error'); break; }
        try {
          const res = await fetch('/api/fs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: args[0], type: 'FILE', parentId: cwd ?? undefined, content: '' }),
          });
          if (res.ok) print(`Created: ${args[0]}`);
          else { const d = await res.json(); print(d.error, 'error'); }
        } catch { print('touch failed', 'error'); }
        break;
      }

      case 'rm': {
        if (!args[0]) { print('rm: missing operand', 'error'); break; }
        const nodes = await fetchChildren(cwd);
        const found = nodes.find((n) => n.name === args[0]);
        if (!found) { print(`rm: ${args[0]}: No such file or directory`, 'error'); break; }
        const res = await fetch(`/api/fs/${found.id}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) print(`Removed: ${args[0]}`);
        else print(`rm: failed`, 'error');
        break;
      }

      case 'cat': {
        if (!args[0]) { print('cat: missing operand', 'error'); break; }
        const nodes = await fetchChildren(cwd);
        const found = nodes.find((n) => n.name === args[0] && n.type === 'FILE');
        if (!found) { print(`cat: ${args[0]}: No such file`, 'error'); break; }
        const res = await fetch(`/api/fs/${found.id}`, { credentials: 'include' });
        const { data } = await res.json();
        if (data?.node?.content) {
          data.node.content.split('\n').forEach((line: string) => print(line));
        } else {
          print('(empty file)');
        }
        break;
      }

      case 'mv': {
        if (!args[0] || !args[1]) { print('mv: usage: mv <source> <dest>', 'error'); break; }
        const nodes = await fetchChildren(cwd);
        const src = nodes.find((n) => n.name === args[0]);
        if (!src) { print(`mv: ${args[0]}: not found`, 'error'); break; }
        const res = await fetch(`/api/fs/${src.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: args[1] }),
        });
        if (res.ok) print(`Renamed: ${args[0]} → ${args[1]}`);
        else print('mv: failed', 'error');
        break;
      }

      case 'cp': {
        if (!args[0] || !args[1]) { print('cp: usage: cp <source> <dest>', 'error'); break; }
        const nodes = await fetchChildren(cwd);
        const src = nodes.find((n) => n.name === args[0] && n.type === 'FILE');
        if (!src) { print(`cp: ${args[0]}: not found`, 'error'); break; }
        const res = await fetch(`/api/fs/${src.id}/copy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ newParentId: cwd, newName: args[1] }),
        });
        if (res.ok) print(`Copied: ${args[0]} → ${args[1]}`);
        else print('cp: failed', 'error');
        break;
      }

      case 'clear': {
        setLines([]);
        break;
      }

      case '': {
        break;
      }

      default: {
        print(`${command}: command not found`, 'error');
        print('Type "help" for available commands.');
      }
    }
  }

  async function fetchChildren(dirId: string | null): Promise<VfsNode[]> {
    const url = dirId ? `/api/fs?parentId=${dirId}` : '/api/fs';
    const res = await fetch(url, { credentials: 'include' });
    const { data } = await res.json();
    return data?.nodes ?? [];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    print(`${cwdPath}$ ${cmd}`, 'input');
    setHistory((prev) => [cmd, ...prev.slice(0, 99)]);
    setHistoryIndex(-1);
    setInput('');
    await execute(cmd);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? '' : history[newIndex]);
    }
  }

  return (
    <div
      className="flex flex-col h-full font-mono text-sm"
      style={{ background: '#11111b', color: '#cdd6f4' }}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex-1 overflow-auto p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.type === 'error' ? '#f38ba8' : line.type === 'input' ? '#a6e3a1' : '#cdd6f4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {line.content || '\u00A0'}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center px-3 py-2 gap-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#a6e3a1', flexShrink: 0 }}>{cwdPath}$</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none"
          style={{ color: '#cdd6f4', caretColor: '#89b4fa' }}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </form>
    </div>
  );
}
