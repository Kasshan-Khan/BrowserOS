'use client';

import React, { useEffect, useRef } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Video as VideoIcon,
  VideoOff, Maximize2, Minimize2,
} from 'lucide-react';
import { useWebRTC, type CallType } from '@/hooks/useWebRTC';

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoCall() {
  const {
    callState, callType, remoteUsername,
    localStream, remoteStream, incomingCall,
    isMuted, isVideoOff,
    acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo,
  } = useWebRTC();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // ─── Incoming call overlay ──────────────────────────────────────────────────

  if (callState === 'incoming' && incomingCall) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: '#0f0f17' }}>
        <div className="text-center space-y-6">
          {/* Pulsing avatar */}
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: incomingCall.callType === 'video' ? '#8b5cf6' : '#3b82f6' }} />
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold" style={{ background: `linear-gradient(135deg, ${incomingCall.callType === 'video' ? '#8b5cf6, #ec4899' : '#3b82f6, #06b6d4'})` }}>
              {incomingCall.fromUsername[0].toUpperCase()}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white">{incomingCall.fromUsername}</h2>
            <p className="text-sm text-zinc-400 mt-1">
              Incoming {incomingCall.callType} call…
            </p>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={rejectCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
            >
              <PhoneOff size={22} className="text-white" />
            </button>
            <button
              onClick={acceptCall}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-colors shadow-lg shadow-emerald-500/30"
            >
              <Phone size={22} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Outgoing call ──────────────────────────────────────────────────────────

  if (callState === 'outgoing') {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: '#0f0f17' }}>
        <div className="text-center space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center text-3xl font-bold animate-pulse" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
            <Phone size={32} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Calling…</h2>
            <p className="text-sm text-zinc-400 mt-1">Waiting for answer</p>
          </div>
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors mx-auto shadow-lg shadow-red-600/30"
          >
            <PhoneOff size={22} className="text-white" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Connected call ─────────────────────────────────────────────────────────

  if (callState === 'connected') {
    const isVideoCall = callType === 'video';

    return (
      <div className="flex flex-col h-full relative" style={{ background: '#0a0a14' }}>
        {/* Remote video / Audio-only UI */}
        {isVideoCall ? (
          <div className="flex-1 relative">
            <video
              ref={remoteVideoRef}
              autoPlay playsInline
              className="w-full h-full object-cover"
              style={{ background: '#000' }}
            />
            {/* Local video PiP */}
            <div className="absolute bottom-4 right-4 w-36 h-28 rounded-xl overflow-hidden shadow-2xl" style={{ border: '2px solid rgba(255,255,255,0.1)' }}>
              <video
                ref={localVideoRef}
                autoPlay playsInline muted
                className="w-full h-full object-cover"
                style={{ background: '#1a1a2e', transform: 'scaleX(-1)' }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-28 h-28 mx-auto rounded-full flex items-center justify-center text-4xl font-bold" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                {remoteUsername?.[0].toUpperCase() ?? '?'}
              </div>
              <h2 className="text-lg font-semibold text-white">{remoteUsername}</h2>
              <div className="flex items-center gap-2 justify-center text-emerald-400 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </div>
            </div>
          </div>
        )}

        {/* Call controls bar */}
        <div className="flex items-center justify-center gap-4 py-5 shrink-0" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-600/80' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {isMuted ? <MicOff size={18} className="text-white" /> : <Mic size={18} className="text-white" />}
          </button>
          {isVideoCall && (
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? 'bg-red-600/80' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {isVideoOff ? <VideoOff size={18} className="text-white" /> : <VideoIcon size={18} className="text-white" />}
            </button>
          )}
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
          >
            <PhoneOff size={20} className="text-white" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Idle state ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full items-center justify-center" style={{ background: '#0f0f17' }}>
      <div className="text-center space-y-3">
        <Phone size={40} className="mx-auto text-zinc-700" />
        <p className="text-sm text-zinc-500">No active call</p>
        <p className="text-xs text-zinc-700">Start a call from Messenger</p>
      </div>
    </div>
  );
}
