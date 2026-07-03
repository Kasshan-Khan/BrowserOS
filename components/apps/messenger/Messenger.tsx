'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User, MessageSquare, Plus, Check, X, Send, Clock } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/auth.store';

// Types
type UserType = { id: string; username: string; displayName: string; avatarUrl: string | null; isActive: boolean };
type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
type Friendship = { id: string; userId: string; friendId: string; status: FriendshipStatus; user: UserType; friend: UserType };
type Message = { id: string; senderId: string; receiverId: string; content: string; createdAt: string; isRead: boolean };

export default function Messenger({ appId }: { appId: string }) {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();
  
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [activeChat, setActiveChat] = useState<UserType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [addFriendMode, setAddFriendMode] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [messageInput, setMessageInput] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial fetch
  useEffect(() => {
    fetchFriends();
  }, []);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onFriendRequest = ({ friendship }: { friendship: Friendship }) => {
      setFriendships((prev) => {
        // If it's already there (e.g. we just accepted it), update it
        const exists = prev.find(f => f.id === friendship.id);
        if (exists) return prev.map(f => f.id === friendship.id ? friendship : f);
        return [friendship, ...prev];
      });
    };

    const onMessageReceived = ({ message }: { message: Message }) => {
      // If it's for the currently open chat, append it
      setMessages((prev) => {
        if (activeChat && (message.senderId === activeChat.id || message.receiverId === activeChat.id)) {
          return [...prev, message];
        }
        return prev; // We'd ideally show a notification badge here
      });
    };

    socket.on('messenger:friend_request', onFriendRequest);
    socket.on('messenger:message_received', onMessageReceived);

    return () => {
      socket.off('messenger:friend_request', onFriendRequest);
      socket.off('messenger:message_received', onMessageReceived);
    };
  }, [socket, activeChat]);

  // --- API Calls ---

  const fetchFriends = async () => {
    try {
      const res = await fetch('/api/social/friends');
      if (res.ok) {
        const data = await res.json();
        setFriendships(data.friendships);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMessages = async (friendId: string) => {
    try {
      const res = await fetch(`/api/social/messages?friendId=${friendId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
        setFriendships(prev => [data.friendship, ...prev]);
        setAddFriendUsername('');
      } else {
        setAddFriendStatus({ type: 'error', text: data.error });
      }
    } catch (e) {
      setAddFriendStatus({ type: 'error', text: 'An error occurred' });
    }
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
          setFriendships(prev => prev.filter(f => f.id !== friendshipId));
        } else {
          const data = await res.json();
          setFriendships(prev => prev.map(f => f.id === friendshipId ? data.friendship : f));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeChat) return;

    const content = messageInput;
    setMessageInput(''); // Optimistic clear
    
    try {
      const res = await fetch('/api/social/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: activeChat.id, content }),
      });
      
      // If it fails, maybe restore input? (Simplifying for now)
      if (!res.ok) {
        console.error('Failed to send');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- Helpers ---

  const getOtherUser = (f: Friendship) => {
    return f.userId === currentUser?.id ? f.friend : f.user;
  };

  const pendingRequests = friendships.filter(f => f.status === 'PENDING');
  const acceptedFriends = friendships.filter(f => f.status === 'ACCEPTED');

  return (
    <div className="flex h-full w-full bg-white/95 dark:bg-zinc-950/95 text-zinc-900 dark:text-zinc-100 overflow-hidden select-none backdrop-blur-xl">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-500" />
            Messenger
          </h2>
          <button 
            onClick={() => setAddFriendMode(!addFriendMode)}
            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          
          {/* Add Friend UI */}
          {addFriendMode && (
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg shadow-inner">
              <form onSubmit={sendFriendRequest} className="space-y-2">
                <input
                  type="text"
                  placeholder="Username"
                  value={addFriendUsername}
                  onChange={(e) => setAddFriendUsername(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded"
                />
                <button type="submit" className="w-full py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors">
                  Add Friend
                </button>
                {addFriendStatus && (
                  <p className={`text-xs ${addFriendStatus.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                    {addFriendStatus.text}
                  </p>
                )}
              </form>
            </div>
          )}

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-2 px-2 uppercase tracking-wider">Pending Requests</div>
              <div className="space-y-1">
                {pendingRequests.map(req => {
                  const other = getOtherUser(req);
                  const isIncoming = req.userId !== currentUser?.id;
                  
                  return (
                    <div key={req.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                          <User size={14} />
                        </div>
                        <span className="text-sm truncate">{other.displayName}</span>
                      </div>
                      
                      {isIncoming ? (
                        <div className="flex gap-1">
                          <button onClick={() => respondToRequest(req.id, 'ACCEPT')} className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded">
                            <Check size={16} />
                          </button>
                          <button onClick={() => respondToRequest(req.id, 'REJECT')} className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <Clock size={14} className="text-zinc-400 mr-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Friends List */}
          <div>
            <div className="text-xs font-semibold text-zinc-500 mb-2 px-2 uppercase tracking-wider">Friends</div>
            {acceptedFriends.length === 0 ? (
              <p className="text-xs text-zinc-500 px-2">No friends yet.</p>
            ) : (
              <div className="space-y-1">
                {acceptedFriends.map(friendship => {
                  const friend = getOtherUser(friendship);
                  return (
                    <button
                      key={friendship.id}
                      onClick={() => setActiveChat(friend)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${activeChat?.id === friend.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
                    >
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-300 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                          <User size={14} />
                        </div>
                        {friend.isActive && (
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-zinc-50 dark:border-zinc-900 rounded-full" />
                        )}
                      </div>
                      <div className="truncate flex-1">
                        <div className="text-sm font-medium">{friend.displayName}</div>
                        <div className="text-xs text-zinc-500">@{friend.username}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-100/50 dark:bg-zinc-950/50">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 shrink-0">
              <h3 className="font-semibold">{activeChat.displayName}</h3>
              <p className="text-xs text-zinc-500">@{activeChat.username}</p>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                  No messages yet. Say hi!
                </div>
              ) : (
                messages.map(msg => {
                  const isMine = msg.senderId === currentUser?.id;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                        isMine 
                          ? 'bg-blue-600 text-white rounded-br-sm' 
                          : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm border border-zinc-200 dark:border-zinc-700 shadow-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 mx-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button 
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="p-2.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p>Select a friend to start chatting</p>
          </div>
        )}
      </div>

    </div>
  );
}
