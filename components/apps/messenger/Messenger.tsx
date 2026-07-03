'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, MessageSquare, Plus, Check, X, Send, Clock, Paperclip,
  Users, Phone, Video, Search, ChevronLeft, FileText, Download, Hash,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAuthStore } from '@/store/auth.store';
import { usePresenceStore } from '@/hooks/usePresence';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserType = {
  id: string; username: string; displayName: string; avatarUrl: string | null;
};
type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
type Friendship = {
  id: string; userId: string; friendId: string; status: FriendshipStatus;
  user: UserType; friend: UserType;
};
type Message = {
  id: string; senderId: string; receiverId?: string; groupId?: string;
  content: string; attachmentId?: string; attachmentName?: string;
  createdAt: string; isRead: boolean;
  sender?: UserType;
};
type GroupChat = {
  id: string; name: string; ownerId: string;
  members: { user: UserType }[];
  messages?: Message[];
};

type ChatTarget =
  | { type: 'dm'; user: UserType }
  | { type: 'group'; group: GroupChat };

// ─── Component ────────────────────────────────────────────────────────────────

export default function Messenger() {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();
  const onlineUsers = usePresenceStore((s) => s.onlineUsers);
  const friendPresence = usePresenceStore((s) => s.friendPresence);
  const { initiateCall } = useWebRTC();

  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [activeChat, setActiveChat] = useState<ChatTarget | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [addMode, setAddMode] = useState<'friend' | 'group' | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ─── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => { fetchFriends(); fetchGroups(); }, []);

  useEffect(() => {
    if (!activeChat) { setMessages([]); return; }
    if (activeChat.type === 'dm') fetchMessages(activeChat.user.id);
    else fetchGroupMessages(activeChat.group.id);
  }, [activeChat]);

  const fetchFriends = async () => {
    try {
      const res = await fetch('/api/social/friends');
      if (res.ok) {
        const data = await res.json();
        setFriendships(data.friendships);
      }
    } catch { /* */ }
    finally { setIsLoading(false); }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/social/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups);
        // Join group socket rooms
        if (socket) {
          for (const g of data.groups) {
            socket.emit('group:join', { groupId: g.id });
          }
        }
      }
    } catch { /* */ }
  };

  const fetchMessages = async (friendId: string) => {
    try {
      const res = await fetch(`/api/social/messages?friendId=${friendId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        // Clear unread count
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          next.delete(friendId);
          return next;
        });
      }
    } catch { /* */ }
  };

  const fetchGroupMessages = async (groupId: string) => {
    try {
      const res = await fetch(`/api/social/messages?groupId=${groupId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          next.delete(groupId);
          return next;
        });
      }
    } catch { /* */ }
  };

  // ─── Socket listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onFriendRequest = ({ friendship }: { friendship: Friendship }) => {
      setFriendships((prev) => {
        const exists = prev.find((f) => f.id === friendship.id);
        if (exists) return prev.map((f) => (f.id === friendship.id ? friendship : f));
        return [friendship, ...prev];
      });
    };

    const onMessageReceived = ({ message }: { message: Message }) => {
      const chatId = activeChat?.type === 'dm' ? activeChat.user.id : null;
      const isCurrent = chatId && (message.senderId === chatId || message.receiverId === chatId);

      if (isCurrent) {
        setMessages((prev) => [...prev, message]);
      } else {
        // Increment unread
        const key = message.senderId === currentUser?.id ? message.receiverId! : message.senderId;
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          next.set(key, (next.get(key) ?? 0) + 1);
          return next;
        });
      }
    };

    const onGroupMessage = ({ message }: { message: Message }) => {
      if (message.senderId === currentUser?.id) return;
      const isCurrent = activeChat?.type === 'group' && activeChat.group.id === message.groupId;

      if (isCurrent) {
        setMessages((prev) => [...prev, message]);
      } else if (message.groupId) {
        setUnreadCounts((prev) => {
          const next = new Map(prev);
          next.set(message.groupId!, (next.get(message.groupId!) ?? 0) + 1);
          return next;
        });
      }
    };

    socket.on('messenger:friend_request', onFriendRequest);
    socket.on('messenger:message_received', onMessageReceived);
    socket.on('group:message_received', onGroupMessage);

    return () => {
      socket.off('messenger:friend_request', onFriendRequest);
      socket.off('messenger:message_received', onMessageReceived);
      socket.off('group:message_received', onGroupMessage);
    };
  }, [socket, activeChat, currentUser?.id]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFriendUsername.trim()) return;
    setAddFriendStatus(null);
    try {
      const res = await fetch('/api/social/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addFriendUsername }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddFriendStatus({ type: 'success', text: 'Request sent!' });
        setFriendships((prev) => [data.friendship, ...prev]);
        setAddFriendUsername('');
      } else {
        setAddFriendStatus({ type: 'error', text: data.error });
      }
    } catch {
      setAddFriendStatus({ type: 'error', text: 'An error occurred' });
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedMembers.length === 0) return;
    try {
      const res = await fetch('/api/social/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, memberIds: selectedMembers }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroups((prev) => [data.group, ...prev]);
        setGroupName('');
        setSelectedMembers([]);
        setAddMode(null);
        if (socket) socket.emit('group:join', { groupId: data.group.id });
      }
    } catch { /* */ }
  };

  const respondToRequest = async (friendshipId: string, action: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await fetch('/api/social/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId, action }),
      });
      if (res.ok) {
        if (action === 'REJECT') {
          setFriendships((prev) => prev.filter((f) => f.id !== friendshipId));
        } else {
          const data = await res.json();
          setFriendships((prev) => prev.map((f) => (f.id === friendshipId ? data.friendship : f)));
        }
      }
    } catch { /* */ }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeChat) return;

    const content = messageInput;
    setMessageInput('');

    try {
      const body: Record<string, string> = { content };
      if (activeChat.type === 'dm') body.receiverId = activeChat.user.id;
      else body.groupId = activeChat.group.id;

      const res = await fetch('/api/social/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok && activeChat.type === 'group') {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
      }
    } catch { /* */ }
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const downloadAttachment = async (attachmentId: string, attachmentName: string) => {
    try {
      const res = await fetch(`/api/fs/${attachmentId}`);
      if (res.ok) {
        const json = await res.json();
        const content = json.data?.node?.content;
        if (!content) {
          alert('Download failed: The file content is empty.');
          return;
        }

        const a = document.createElement('a');
        if (content.startsWith('data:')) {
          a.href = content;
        } else {
          const blob = new Blob([content], { type: json.data.node.mimeType || 'application/octet-stream' });
          a.href = URL.createObjectURL(blob);
        }
        a.download = attachmentName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        if (!content.startsWith('data:')) {
          URL.revokeObjectURL(a.href);
        }
      } else {
        const err = await res.json();
        alert(`Download failed: ${err.error || res.statusText}`);
      }
    } catch (err: any) { 
      alert(`Download error: ${err.message}`);
    }
  };

  const getOtherUser = (f: Friendship) => {
    return f.userId === currentUser?.id ? f.friend : f.user;
  };

  const pendingRequests = friendships.filter((f) => f.status === 'PENDING');
  const acceptedFriends = friendships.filter((f) => f.status === 'ACCEPTED');
  const isOnline = (userId: string) => onlineUsers.has(userId);
  const getPresence = (userId: string) => friendPresence.get(userId);

  const filteredFriends = searchQuery
    ? acceptedFriends.filter((f) => {
        const other = getOtherUser(f);
        return other.displayName.toLowerCase().includes(searchQuery.toLowerCase())
          || other.username.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : acceptedFriends;

  const filteredGroups = searchQuery
    ? groups.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : groups;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full overflow-hidden select-none" style={{ background: '#0f0f17', color: '#e4e4ef' }}>

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#13131d' }}>

        {/* Header */}
        <div className="p-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-400" />
            Messenger
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => setAddMode(addMode === 'friend' ? null : 'friend')}
              className="p-1.5 rounded-md transition-colors hover:bg-white/10"
              title="Add friend"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => setAddMode(addMode === 'group' ? null : 'group')}
              className="p-1.5 rounded-md transition-colors hover:bg-white/10"
              title="New group"
            >
              <Users size={14} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Search size={13} className="text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent text-xs outline-none flex-1 placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3">

          {/* Add Friend Form */}
          {addMode === 'friend' && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <form onSubmit={sendFriendRequest} className="space-y-2">
                <input
                  type="text" placeholder="Username"
                  value={addFriendUsername}
                  onChange={(e) => setAddFriendUsername(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <button type="submit" className="w-full py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors font-medium">
                  Send Request
                </button>
                {addFriendStatus && (
                  <p className={`text-[11px] ${addFriendStatus.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {addFriendStatus.text}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Create Group Form */}
          {addMode === 'group' && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <form onSubmit={createGroup} className="space-y-2">
                <input
                  type="text" placeholder="Group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
                <div className="text-[11px] text-zinc-500 mb-1">Select members:</div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {acceptedFriends.map((f) => {
                    const other = getOtherUser(f);
                    const selected = selectedMembers.includes(other.id);
                    return (
                      <label key={other.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-white/5 text-xs">
                        <input
                          type="checkbox" checked={selected}
                          onChange={() => setSelectedMembers((prev) =>
                            selected ? prev.filter((id) => id !== other.id) : [...prev, other.id]
                          )}
                          className="rounded"
                        />
                        {other.displayName}
                      </label>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className="w-full py-1.5 bg-violet-600 text-white text-xs rounded-md hover:bg-violet-700 transition-colors font-medium disabled:opacity-40"
                >
                  Create Group ({selectedMembers.length} members)
                </button>
              </form>
            </div>
          )}

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 mb-1.5 px-2 uppercase tracking-widest">Requests</div>
              {pendingRequests.map((req) => {
                const other = getOtherUser(req);
                const isIncoming = req.userId !== currentUser?.id;
                return (
                  <div key={req.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                        {other.displayName[0].toUpperCase()}
                      </div>
                      <span className="text-xs truncate">{other.displayName}</span>
                    </div>
                    {isIncoming ? (
                      <div className="flex gap-1">
                        <button onClick={() => respondToRequest(req.id, 'ACCEPT')} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors">
                          <Check size={14} />
                        </button>
                        <button onClick={() => respondToRequest(req.id, 'REJECT')} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <Clock size={12} className="text-zinc-600 mr-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Groups */}
          {filteredGroups.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-zinc-500 mb-1.5 px-2 uppercase tracking-widest">Groups</div>
              {filteredGroups.map((group) => {
                const unread = unreadCounts.get(group.id) ?? 0;
                const isActive = activeChat?.type === 'group' && activeChat.group.id === group.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => setActiveChat({ type: 'group', group })}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${isActive ? 'bg-violet-500/15' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                      <Hash size={14} />
                    </div>
                    <div className="flex-1 truncate">
                      <div className="text-xs font-medium">{group.name}</div>
                      <div className="text-[10px] text-zinc-500">{group.members.length} members</div>
                    </div>
                    {unread > 0 && (
                      <span className="bg-violet-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Friends */}
          <div>
            <div className="text-[10px] font-semibold text-zinc-500 mb-1.5 px-2 uppercase tracking-widest">
              Friends {acceptedFriends.length > 0 && `(${acceptedFriends.length})`}
            </div>
            {filteredFriends.length === 0 ? (
              <p className="text-[11px] text-zinc-600 px-2">No friends yet</p>
            ) : (
              filteredFriends.map((friendship) => {
                const friend = getOtherUser(friendship);
                const online = isOnline(friend.id);
                const presence = getPresence(friend.id);
                const unread = unreadCounts.get(friend.id) ?? 0;
                const isActive = activeChat?.type === 'dm' && activeChat.user.id === friend.id;
                return (
                  <button
                    key={friendship.id}
                    onClick={() => setActiveChat({ type: 'dm', user: friend })}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg transition-colors text-left ${isActive ? 'bg-blue-500/15' : 'hover:bg-white/5'}`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                        {friend.displayName[0].toUpperCase()}
                      </div>
                      <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} style={{ borderColor: '#13131d' }} />
                    </div>
                    <div className="flex-1 truncate">
                      <div className="text-xs font-medium">{friend.displayName}</div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {presence?.currentApp
                          ? `Using ${presence.currentApp}`
                          : presence?.statusText
                            ? presence.statusText
                            : online ? 'Online' : 'Offline'}
                      </div>
                    </div>
                    {unread > 0 && (
                      <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Chat Area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col" style={{ background: '#0f0f17' }}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveChat(null)} className="p-1 hover:bg-white/10 rounded-md transition-colors md:hidden">
                  <ChevronLeft size={16} />
                </button>
                {activeChat.type === 'dm' ? (
                  <>
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                        {activeChat.user.displayName[0].toUpperCase()}
                      </div>
                      <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${isOnline(activeChat.user.id) ? 'bg-emerald-400' : 'bg-zinc-600'}`} style={{ borderColor: '#0f0f17' }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{activeChat.user.displayName}</h3>
                      <p className="text-[11px] text-zinc-500">@{activeChat.user.username}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                      <Hash size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{activeChat.group.name}</h3>
                      <p className="text-[11px] text-zinc-500">{activeChat.group.members.length} members</p>
                    </div>
                  </>
                )}
              </div>
              {activeChat.type === 'dm' && (
                <div className="flex gap-1">
                  <button className="p-2 hover:bg-white/10 rounded-md transition-colors" title="Voice call" onClick={() => initiateCall(activeChat.user.id, 'audio')}>
                    <Phone size={15} className="text-zinc-400" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-md transition-colors" title="Video call" onClick={() => initiateCall(activeChat.user.id, 'video')}>
                    <Video size={15} className="text-zinc-400" />
                  </button>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  <div className="text-center">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No messages yet. Say hi!</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === currentUser?.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      {/* Show sender name in groups */}
                      {activeChat.type === 'group' && !isMine && msg.sender && (
                        <span className="text-[10px] text-zinc-500 mb-0.5 ml-1">{msg.sender.displayName}</span>
                      )}
                      <div className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm ${
                        isMine
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'rounded-bl-sm text-zinc-100'
                      }`} style={isMine ? {} : { background: 'rgba(255,255,255,0.06)' }}>
                        {msg.content}
                        {msg.attachmentName && (
                          <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <FileText size={13} />
                            <span className="truncate flex-1">{msg.attachmentName}</span>
                            <Download size={13} className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer" onClick={() => downloadAttachment(msg.attachmentId!, msg.attachmentName!)} />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-600 mt-0.5 mx-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <form onSubmit={sendMessage} className="flex items-center gap-2">
                <button type="button" className="p-2 hover:bg-white/10 rounded-md transition-colors" title="Attach file" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip size={15} className="text-zinc-500" />
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !activeChat) return;
                  const form = new FormData();
                  form.append('file', file);
                  if (activeChat.type === 'dm') form.append('receiverId', activeChat.user.id);
                  else form.append('groupId', activeChat.group.id);
                  await fetch('/api/social/messages', {
                    method: 'POST',
                    body: form,
                  });
                  e.target.value = '';
                }} />
                <input
                  type="text" value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3.5 py-2 rounded-xl text-sm outline-none placeholder:text-zinc-600"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
                />
                <button
                  type="submit" disabled={!messageInput.trim()}
                  className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
            <MessageSquare size={48} className="mb-3 opacity-15" />
            <p className="text-sm">Select a conversation</p>
            <p className="text-xs text-zinc-700 mt-1">or add a friend to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
