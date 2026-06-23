'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';

export default function TextEditor({ instanceId, appState, onStateChange, onClose }: AppWindowProps) {
  const [content, setContent] = useState((appState.content as string) ?? '');
  const [fileId, setFileId] = useState<string | null>((appState.fileId as string) ?? null);
  const [fileName, setFileName] = useState<string>((appState.fileName as string) ?? 'Untitled');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load file if fileId is provided
  useEffect(() => {
    if (fileId) {
      fetch(`/api/fs/${fileId}`, { credentials: 'include' })
        .then((r) => r.json())
        .then(({ data }) => {
          if (data?.node) {
            setContent(data.node.content ?? '');
            setFileName(data.node.name);
          }
        })
        .catch(() => {});
    }
  }, [fileId]);

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (contentToSave: string) => {
    if (!fileId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/fs/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: contentToSave }),
      });
      if (res.ok) {
        setIsDirty(false);
        setSaveMessage('Saved');
        setTimeout(() => setSaveMessage(''), 2000);
      }
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [fileId]);

  function handleChange(value: string) {
    setContent(value);
    setIsDirty(true);
    onStateChange({ ...appState, content: value, fileId, fileName });

    // Debounced auto-save
    if (fileId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => save(value), 1500);
    }
  }

  async function handleSaveAs() {
    const name = prompt('File name:', fileName);
    if (!name) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          type: 'FILE',
          content,
          mimeType: 'text/plain',
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setFileId(data.node.id);
        setFileName(data.node.name);
        setIsDirty(false);
        onStateChange({ ...appState, fileId: data.node.id, fileName: data.node.name, content });
        setSaveMessage('Saved');
        setTimeout(() => setSaveMessage(''), 2000);
      }
    } catch {
      setSaveMessage('Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  // Handle Ctrl/Cmd+S
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (fileId) save(content);
      else handleSaveAs();
    }
  }

  const lineCount = content.split('\n').length;
  const charCount = content.length;

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: isDirty ? '#f9e2af' : '#cdd6f4' }}>
          {fileName}{isDirty ? ' •' : ''}
        </span>
        <div className="flex-1" />
        {saveMessage && (
          <span className="text-xs" style={{ color: '#a6e3a1' }}>{saveMessage}</span>
        )}
        <button
          onClick={fileId ? () => save(content) : handleSaveAs}
          disabled={isSaving || (!isDirty && !!fileId)}
          className="px-2.5 py-1 rounded text-xs font-medium disabled:opacity-40 hover:bg-white/10 transition-colors"
          style={{ color: '#89b4fa' }}
          title="Save (Ctrl+S)"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {!fileId && (
          <button
            onClick={handleSaveAs}
            className="px-2.5 py-1 rounded text-xs hover:bg-white/10 transition-colors"
            style={{ color: '#89b4fa' }}
          >
            Save As
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex">
        {/* Line numbers */}
        <div
          className="py-3 px-2 text-right text-xs leading-6 select-none flex-shrink-0 overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.15)', color: '#6c7086', minWidth: 40 }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ height: 24 }}>{i + 1}</div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-none outline-none p-3 font-mono text-sm leading-6"
          style={{
            background: '#1e1e2e',
            color: '#cdd6f4',
            caretColor: '#89b4fa',
            tabSize: 2,
          }}
          spellCheck={false}
          placeholder="Start typing…"
        />
      </div>

      {/* Status bar */}
      <div
        className="px-3 py-1 text-xs flex items-center gap-4 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#6c7086' }}
      >
        <span>Lines: {lineCount}</span>
        <span>Chars: {charCount}</span>
        {fileId && <span style={{ color: '#a6e3a1' }}>●</span>}
      </div>
    </div>
  );
}
