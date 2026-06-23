'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AppWindowProps } from '@/registry/app-registry';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function Notes({ instanceId, appState, onStateChange }: AppWindowProps) {
  const [notes, setNotes] = useState<Note[]>((appState.notes as Note[]) ?? []);
  const [selectedId, setSelectedId] = useState<string | null>((appState.selectedId as string) ?? null);
  const [editingContent, setEditingContent] = useState('');

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedNote) {
      setEditingContent(selectedNote.content);
    }
  }, [selectedId]);

  function saveState(updatedNotes: Note[], sid: string | null) {
    onStateChange({ ...appState, notes: updatedNotes, selectedId: sid });
  }

  function createNote() {
    const id = crypto.randomUUID();
    const note: Note = {
      id,
      title: 'New Note',
      content: '',
      updatedAt: new Date().toISOString(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    setSelectedId(id);
    setEditingContent('');
    saveState(updated, id);
  }

  function deleteNote(id: string) {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    const newSelected = updated[0]?.id ?? null;
    setSelectedId(newSelected);
    saveState(updated, newSelected);
  }

  function updateContent(content: string) {
    setEditingContent(content);
    const title = content.split('\n')[0]?.slice(0, 40) || 'Untitled';
    const updated = notes.map((n) =>
      n.id === selectedId
        ? { ...n, content, title, updatedAt: new Date().toISOString() }
        : n
    );
    setNotes(updated);
    saveState(updated, selectedId);
  }

  return (
    <div className="flex h-full" style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
      {/* Sidebar */}
      <div
        className="w-52 flex flex-col flex-shrink-0"
        style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-sm font-semibold">Notes</span>
          <button
            onClick={createNote}
            className="w-6 h-6 rounded flex items-center justify-center text-lg hover:bg-white/10"
            title="New note"
          >+</button>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {notes.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#6c7086' }}>No notes yet</p>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className="px-3 py-2 cursor-default group relative"
                style={{
                  background: selectedId === note.id ? 'rgba(137,180,250,0.15)' : 'transparent',
                  borderLeft: selectedId === note.id ? '2px solid #89b4fa' : '2px solid transparent',
                }}
              >
                <p className="text-sm font-medium truncate">{note.title || 'Untitled'}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#6c7086' }}>
                  {new Date(note.updatedAt).toLocaleDateString()}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1 hover:text-red-400"
                  style={{ color: '#f38ba8' }}
                >×</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        {selectedNote ? (
          <textarea
            value={editingContent}
            onChange={(e) => updateContent(e.target.value)}
            className="flex-1 resize-none outline-none p-4 text-sm leading-relaxed"
            style={{ background: '#1e1e2e', color: '#cdd6f4', caretColor: '#89b4fa' }}
            placeholder="Start writing…"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: '#6c7086' }}>
            <span className="text-4xl">🗒️</span>
            <p className="text-sm">Select a note or create a new one</p>
            <button
              onClick={createNote}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: '#89b4fa', color: '#1e1e2e' }}
            >
              New note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
