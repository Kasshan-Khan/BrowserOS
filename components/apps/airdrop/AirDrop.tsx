'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Download, X, Check, FileText, User, RefreshCw, Wifi,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/auth.store';
import { usePresenceStore } from '@/hooks/usePresence';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Friend {
  id: string;
  username: string;
  displayName: string;
}

interface Transfer {
  id: string;
  fileName: string;
  fileSize: number;
  sender: { id: string; username: string; displayName: string };
}

interface VfsFile {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AirDrop() {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [files, setFiles] = useState<VfsFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<VfsFile | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<Transfer[]>([]);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Radar animation
  const [radarAngle, setRadarAngle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRadarAngle((a) => (a + 2) % 360);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchFriends();
    fetchPendingTransfers();
    fetchFiles();
  }, []);

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
    finally { setIsLoading(false); }
  };

  const fetchPendingTransfers = async () => {
    try {
      const res = await fetch('/api/social/airdrop');
      if (res.ok) {
        const data = await res.json();
        setPendingTransfers(data.transfers);
      }
    } catch { /* */ }
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/fs?type=FILE');
      if (res.ok) {
        const data = await res.json();
        setFiles((data.data?.children ?? []).filter((n: any) => n.type === 'FILE'));
      }
    } catch { /* */ }
  };

  // ─── Socket listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onRequest = ({ transfer }: { transfer: Transfer }) => {
      setPendingTransfers((prev) => [transfer, ...prev]);
    };

    const onComplete = ({ transferId, fileName }: { transferId: string; fileName: string }) => {
      setSendStatus(`✓ ${fileName} delivered!`);
      setTimeout(() => setSendStatus(null), 3000);
    };

    const onRejected = ({ transferId, fileName }: { transferId: string; fileName: string }) => {
      setSendStatus(`✗ ${fileName} was declined`);
      setTimeout(() => setSendStatus(null), 3000);
    };

    socket.on('airdrop:request', onRequest);
    socket.on('airdrop:complete', onComplete);
    socket.on('airdrop:rejected', onRejected);

    return () => {
      socket.off('airdrop:request', onRequest);
      socket.off('airdrop:complete', onComplete);
      socket.off('airdrop:rejected', onRejected);
    };
  }, [socket]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const sendFile = async () => {
    if (!selectedFriend || !selectedFile) return;
    setSendStatus('Sending…');
    try {
      const res = await fetch('/api/social/airdrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: selectedFriend.id,
          fileNodeId: selectedFile.id,
        }),
      });
      if (res.ok) {
        setSendStatus(`Sent ${selectedFile.name} to ${selectedFriend.displayName}`);
        setSelectedFile(null);
      } else {
        const data = await res.json();
        setSendStatus(`Error: ${data.error}`);
      }
    } catch {
      setSendStatus('Failed to send');
    }
    setTimeout(() => setSendStatus(null), 3000);
  };

  const respondTransfer = async (transferId: string, action: 'ACCEPT' | 'REJECT') => {
    try {
      await fetch('/api/social/airdrop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId, action }),
      });
      setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
    } catch { /* */ }
  };

  const onlineFriends = friends.filter((f) => onlineUsers.has(f.id));
  const offlineFriends = friends.filter((f) => !onlineUsers.has(f.id));

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: '#0a0a1a', color: '#e4e4ef' }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Wifi size={18} className="text-cyan-400" />
        <div>
          <h2 className="text-sm font-semibold">AirDrop</h2>
          <p className="text-[10px] text-zinc-500">{onlineFriends.length} friends nearby</p>
        </div>
        <div className="flex-1" />
        <button onClick={() => { fetchFriends(); fetchPendingTransfers(); }} className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
          <RefreshCw size={13} className="text-zinc-400" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* Left: Radar + Friends */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">

          {/* Radar visualization */}
          <div className="relative w-64 h-64 shrink-0">
            {/* Radar rings */}
            {[1, 0.7, 0.4].map((scale, i) => (
              <div key={i} className="absolute inset-0 rounded-full" style={{
                border: '1px solid rgba(6,182,212,0.1)',
                transform: `scale(${scale})`,
              }} />
            ))}

            {/* Radar sweep */}
            <div className="absolute inset-0 rounded-full overflow-hidden" style={{
              background: `conic-gradient(from ${radarAngle}deg, transparent 0deg, rgba(6,182,212,0.15) 30deg, transparent 60deg)`,
            }} />

            {/* Center dot (You) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold z-10" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)', boxShadow: '0 0 20px rgba(6,182,212,0.4)' }}>
              You
            </div>

            {/* Online friends positioned around the radar */}
            {onlineFriends.map((friend, i) => {
              const angle = (i * (360 / Math.max(onlineFriends.length, 1))) * (Math.PI / 180);
              const radius = 80 + (i % 2) * 20;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const isSelected = selectedFriend?.id === friend.id;

              return (
                <button
                  key={friend.id}
                  onClick={() => setSelectedFriend(friend)}
                  className={`absolute w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${isSelected ? 'ring-2 ring-cyan-400 scale-110' : 'hover:scale-105'}`}
                  style={{
                    top: `calc(50% + ${y}px - 18px)`,
                    left: `calc(50% + ${x}px - 18px)`,
                    background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                    boxShadow: isSelected ? '0 0 16px rgba(6,182,212,0.5)' : '0 0 8px rgba(139,92,246,0.3)',
                  }}
                  title={friend.displayName}
                >
                  {friend.displayName[0].toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* Status message */}
          {sendStatus && (
            <div className="mt-4 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' }}>
              {sendStatus}
            </div>
          )}

          {/* Send area */}
          {selectedFriend && (
            <div className="mt-4 w-full max-w-xs space-y-2">
              <div className="text-xs text-zinc-400 text-center">
                Send to <span className="text-cyan-400 font-medium">{selectedFriend.displayName}</span>
              </div>

              {/* File picker */}
              <select
                value={selectedFile?.id ?? ''}
                onChange={(e) => {
                  const file = files.find((f) => f.id === e.target.value);
                  setSelectedFile(file ?? null);
                }}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="">Select a file…</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({formatSize(f.size)})</option>
                ))}
              </select>

              <button
                onClick={sendFile}
                disabled={!selectedFile}
                className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }}
              >
                <Send size={13} />
                Send File
              </button>
            </div>
          )}
        </div>

        {/* Right: Incoming transfers */}
        <div className="w-56 shrink-0 flex flex-col" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          <div className="px-3 py-2.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Download size={11} className="inline mr-1.5" />
            Incoming
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {pendingTransfers.length === 0 ? (
              <div className="text-center text-zinc-600 text-[11px] mt-8">
                <Download size={20} className="mx-auto mb-2 opacity-30" />
                No incoming files
              </div>
            ) : (
              pendingTransfers.map((t) => (
                <div key={t.id} className="p-2.5 rounded-lg space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start gap-2">
                    <FileText size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{t.fileName}</div>
                      <div className="text-[10px] text-zinc-500">
                        {formatSize(t.fileSize)} • from {t.sender.displayName}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => respondTransfer(t.id, 'ACCEPT')}
                      className="flex-1 py-1 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors flex items-center justify-center gap-1"
                    >
                      <Check size={11} /> Accept
                    </button>
                    <button
                      onClick={() => respondTransfer(t.id, 'REJECT')}
                      className="flex-1 py-1 rounded text-[10px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center justify-center gap-1"
                    >
                      <X size={11} /> Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
