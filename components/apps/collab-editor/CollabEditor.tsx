'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Share2, Save, Users, Circle, Code, FileText, X, UserPlus,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/auth.store';
import type { AppWindowProps } from '@/registry/app-registry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RemoteCursor {
  userId: string;
  username: string;
  line: number;
  column: number;
  color: string;
}

interface CollabSession {
  sessionId: string;
  fileId: string;
  fileName: string;
}

const CURSOR_COLORS = [
  '#f43f5e', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#6366f1',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollabEditor({ instanceId, appState, onStateChange, onClose }: AppWindowProps) {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();

  const [content, setContent] = useState((appState.content as string) ?? '');
  const [fileId, setFileId] = useState<string | null>((appState.fileId as string) ?? null);
  const [fileName, setFileName] = useState<string>((appState.fileName as string) ?? 'Untitled');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Collab state
  const [session, setSession] = useState<CollabSession | null>(
    appState.collabSession ? (appState.collabSession as CollabSession) : null
  );
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [friends, setFriends] = useState<Array<{ id: string; username: string; displayName: string }>>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRemoteUpdateRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load file ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (fileId && !session) {
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
  }, [fileId, session]);

  // ─── Socket collab events ──────────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !session) return;

    // Join the collab room
    socket.emit('collab:join', { sessionId: session.sessionId });

    const onContentChange = ({ userId, username, content: newContent, cursorPos }: {
      userId: string; username: string; content: string; cursorPos: number;
    }) => {
      if (userId === currentUser?.id) return;
      isRemoteUpdateRef.current = true;
      setContent(newContent);
      // Update remote cursor
      const lines = newContent.substring(0, cursorPos).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length;
      setRemoteCursors((prev) => {
        const existing = prev.find((c) => c.userId === userId);
        const color = existing?.color ?? CURSOR_COLORS[prev.length % CURSOR_COLORS.length];
        return [
          ...prev.filter((c) => c.userId !== userId),
          { userId, username, line, column, color },
        ];
      });
    };

    const onCursorMove = ({ userId, username, line, column }: {
      userId: string; username: string; line: number; column: number;
    }) => {
      if (userId === currentUser?.id) return;
      setRemoteCursors((prev) => {
        const existing = prev.find((c) => c.userId === userId);
        const color = existing?.color ?? CURSOR_COLORS[prev.length % CURSOR_COLORS.length];
        return [
          ...prev.filter((c) => c.userId !== userId),
          { userId, username, line, column, color },
        ];
      });
    };

    const onJoin = ({ userId, username }: { userId: string; username: string }) => {
      setParticipants((prev) => [...new Set([...prev, username])]);
    };

    const onLeave = ({ userId, username }: { userId: string; username: string }) => {
      setParticipants((prev) => prev.filter((p) => p !== username));
      setRemoteCursors((prev) => prev.filter((c) => c.userId !== userId));
    };

    const onInvite = ({ sessionId, fileId: fId, fileName: fName, fromDisplayName }: {
      sessionId: string; fileId: string; fileName: string; fromDisplayName: string;
    }) => {
      // Auto-join if we receive an invite while editor is open
      setSession({ sessionId, fileId: fId, fileName: fName });
      setFileId(fId);
      setFileName(fName);
    };

    socket.on('collab:content_change', onContentChange);
    socket.on('collab:cursor_move', onCursorMove);
    socket.on('collab:join', onJoin);
    socket.on('collab:leave', onLeave);
    socket.on('collab:invite', onInvite);

    return () => {
      socket.emit('collab:leave', { sessionId: session.sessionId });
      socket.off('collab:content_change', onContentChange);
      socket.off('collab:cursor_move', onCursorMove);
      socket.off('collab:join', onJoin);
      socket.off('collab:leave', onLeave);
      socket.off('collab:invite', onInvite);
    };
  }, [socket, session, currentUser?.id]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleChange = (value: string) => {
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    setContent(value);
    setIsDirty(true);
    onStateChange({ ...appState, content: value, fileId, fileName });

    // Broadcast to collab peers
    if (socket && session) {
      const cursorPos = textareaRef.current?.selectionStart ?? 0;
      socket.emit('collab:content_change', {
        sessionId: session.sessionId,
        content: value,
        cursorPos,
      });
    }

    // Auto-save
    if (fileId) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(value), 2000);
    }
  };

  const handleCursorMove = () => {
    if (!socket || !session || !textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const lines = content.substring(0, pos).split('\n');
    socket.emit('collab:cursor_move', {
      sessionId: session.sessionId,
      line: lines.length,
      column: lines[lines.length - 1].length,
    });
  };

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
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [fileId]);

  const handleSaveAs = async () => {
    const name = prompt('File name:', fileName);
    if (!name) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, type: 'FILE', content, mimeType: 'text/plain' }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setFileId(data.node.id);
        setFileName(data.node.name);
        setIsDirty(false);
        onStateChange({ ...appState, fileId: data.node.id, fileName: data.node.name, content });
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const startCollab = async (inviteeId: string) => {
    if (!fileId) {
      alert('Save the file first before sharing.');
      return;
    }
    try {
      const res = await fetch('/api/social/collab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, inviteeId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
        onStateChange({ ...appState, collabSession: data });
        setShowShareModal(false);
      }
    } catch { /* */ }
  };

  const fetchFriends = async () => {
    try {
      const res = await fetch('/api/social/friends');
      if (res.ok) {
        const data = await res.json();
        const accepted = data.friendships
          .filter((f: any) => f.status === 'ACCEPTED')
          .map((f: any) => {
            const other = f.userId === currentUser?.id ? f.friend : f.user;
            return { id: other.id, username: other.username, displayName: other.displayName };
          });
        setFriends(accepted);
      }
    } catch { /* */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (fileId) save(content);
      else handleSaveAs();
    }
  };

  const lineCount = content.split('\n').length;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: '#1a1a2e', color: '#e2e8f0' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Code size={14} className="text-violet-400 shrink-0" />
        <span className="text-xs font-medium truncate max-w-[180px]" style={{ color: isDirty ? '#fbbf24' : '#e2e8f0' }}>
          {fileName}{isDirty ? ' •' : ''}
        </span>
        <div className="flex-1" />

        {/* Participants */}
        {session && (
          <div className="flex items-center gap-1 mr-2">
            {remoteCursors.map((c) => (
              <div key={c.userId} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{ background: `${c.color}20`, color: c.color }}>
                <Circle size={6} fill={c.color} />
                {c.username}
              </div>
            ))}
          </div>
        )}

        {saveMsg && <span className="text-[11px] text-emerald-400">{saveMsg}</span>}

        {/* Share button */}
        <button
          onClick={() => { fetchFriends(); setShowShareModal(true); }}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium hover:bg-white/10 transition-colors"
          style={{ color: session ? '#8b5cf6' : '#94a3b8' }}
          title="Share & collaborate"
        >
          <Share2 size={12} />
          {session ? 'Live' : 'Share'}
        </button>

        <button
          onClick={fileId ? () => save(content) : handleSaveAs}
          disabled={isSaving || (!isDirty && !!fileId)}
          className="px-2 py-1 rounded text-[11px] font-medium disabled:opacity-30 hover:bg-white/10 transition-colors"
          style={{ color: '#60a5fa' }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden flex">
        {/* Line numbers */}
        <div
          className="py-3 px-2 text-right text-[11px] leading-6 select-none shrink-0 overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.2)', color: '#475569', minWidth: 44 }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ height: 24 }}>{i + 1}</div>
          ))}
        </div>

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={handleCursorMove}
            onKeyUp={handleCursorMove}
            className="w-full h-full resize-none outline-none p-3 font-mono text-sm leading-6"
            style={{ background: '#1a1a2e', color: '#e2e8f0', caretColor: '#8b5cf6', tabSize: 2 }}
            spellCheck={false}
            placeholder="Start typing…"
          />

          {/* Remote cursor indicators (shown as colored lines at the top) */}
          {remoteCursors.length > 0 && (
            <div className="absolute top-0 right-2 flex gap-1 p-1">
              {remoteCursors.map((c) => (
                <div key={c.userId} className="text-[9px] px-1.5 py-0.5 rounded-b font-medium" style={{ background: c.color, color: '#fff' }}>
                  {c.username} L{c.line}:{c.column}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div
        className="px-3 py-1 text-[11px] flex items-center gap-4 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}
      >
        <span>Lines: {lineCount}</span>
        <span>Chars: {content.length}</span>
        {session && (
          <span className="flex items-center gap-1 text-violet-400">
            <Users size={10} />
            Collaborative ({remoteCursors.length + 1} editing)
          </span>
        )}
        {fileId && <span className="text-emerald-400">●</span>}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl p-5 w-80" style={{ background: '#1e1e30', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <UserPlus size={14} className="text-violet-400" />
                Share with a friend
              </h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 hover:bg-white/10 rounded">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {friends.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">No friends to invite</p>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => startCollab(f.id)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}>
                      {f.displayName[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{f.displayName}</div>
                      <div className="text-[10px] text-zinc-500">@{f.username}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
