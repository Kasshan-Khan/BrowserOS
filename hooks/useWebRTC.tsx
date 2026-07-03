'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from './useSocket';
import { useAuthStore } from '@/store/auth.store';
import { useWindowStore } from '@/store/window.store';
import { appRegistry } from '@/registry/app-registry';

// ─── Configuration ────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected';
export type CallType = 'audio' | 'video';

export interface IncomingCall {
  fromUserId: string;
  fromUsername: string;
  callType: CallType;
}

export interface UseWebRTCReturn {
  callState: CallState;
  callType: CallType | null;
  remoteUserId: string | null;
  remoteUsername: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  incomingCall: IncomingCall | null;
  isMuted: boolean;
  isVideoOff: boolean;

  initiateCall: (targetUserId: string, type: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

// ─── Context & Provider ────────────────────────────────────────────────────────

const WebRTCContext = createContext<UseWebRTCReturn | null>(null);

export function WebRTCProvider({ children }: { children: React.ReactNode }) {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();

  const [callState, setCallState] = useState<CallState>('idle');
  const callStateRef = useRef<CallState>('idle');

  const [callType, setCallType] = useState<CallType | null>(null);
  
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);
  
  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Keep refs in sync
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    remoteUserIdRef.current = remoteUserId;
  }, [remoteUserId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const openWindow = useWindowStore((s) => s.openWindow);

  // Auto-open video call window for incoming calls
  useEffect(() => {
    if (callState === 'incoming') {
      const app = appRegistry.get('video-call');
      if (app) {
        openWindow({
          instanceId: 'video-call-main',
          appId: 'video-call',
          title: app.name,
          x: Math.round(window.innerWidth / 2 - app.defaultSize.width / 2),
          y: Math.round(window.innerHeight / 2 - app.defaultSize.height / 2),
          width: app.defaultSize.width,
          height: app.defaultSize.height,
          isMinimized: false,
          isMaximized: false,
          appState: {},
        });
      }
    }
  }, [callState, openWindow]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Running cleanup...');
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    const currentLocalStream = localStreamRef.current;
    if (currentLocalStream) {
      currentLocalStream.getTracks().forEach((t) => {
        t.stop();
        console.log(`[WebRTC] Stopped track: ${t.kind}`);
      });
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallType(null);
    setRemoteUserId(null);
    setRemoteUsername(null);
    setIncomingCall(null);
    pendingCandidatesRef.current = [];
  }, []);

  // ─── Create peer connection ───────────────────────────────────────────────

  const createPeerConnection = useCallback((targetUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call:ice_candidate', {
          targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [socket, cleanup]);

  // ─── Get media stream ─────────────────────────────────────────────────────

  const getMediaStream = useCallback(async (type: CallType): Promise<MediaStream> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      alert('Camera and Microphone access requires a secure connection (HTTPS) or localhost.');
      throw new Error('mediaDevices is undefined (insecure context)');
    }
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === 'video',
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      alert(`Could not access media devices: ${err.message}`);
      throw err;
    }
  }, []);

  // ─── Initiate call ────────────────────────────────────────────────────────

  const initiateCall = useCallback(async (targetUserId: string, type: CallType) => {
    if (!socket || callState !== 'idle') return;

    try {
      const stream = await getMediaStream(type);
      setLocalStream(stream);
      setCallType(type);
      setRemoteUserId(targetUserId);
      setCallState('outgoing');

      // Notify the target about the incoming call
      socket.emit('call:initiate', { targetUserId, callType: type });
      
      // We do NOT create the peer connection or send the offer yet!
      // We wait for the target to accept the call (call:accept event).
    } catch (err) {
      console.error('[WebRTC] Failed to initiate call:', err);
      cleanup();
    }
  }, [socket, callState, getMediaStream, cleanup]);

  // ─── Accept call ──────────────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (!socket || !incomingCall) return;

    try {
      const stream = await getMediaStream(incomingCall.callType);
      setLocalStream(stream);
      setCallType(incomingCall.callType);
      setRemoteUserId(incomingCall.fromUserId);
      setRemoteUsername(incomingCall.fromUsername);
      setCallState('connected');

      socket.emit('call:accept', { targetUserId: incomingCall.fromUserId });

      const pc = createPeerConnection(incomingCall.fromUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Process any pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidatesRef.current = [];

      setIncomingCall(null);
    } catch (err) {
      console.error('[WebRTC] Failed to accept call:', err);
      cleanup();
    }
  }, [socket, incomingCall, getMediaStream, createPeerConnection, cleanup]);

  // ─── Reject call ──────────────────────────────────────────────────────────

  const rejectCall = useCallback(() => {
    if (!socket || !incomingCall) return;
    socket.emit('call:reject', { targetUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  }, [socket, incomingCall]);

  // ─── End call ─────────────────────────────────────────────────────────────

  const endCall = useCallback(() => {
    const currentRemoteUserId = remoteUserIdRef.current;
    console.log(`[WebRTC] endCall called, targetUserId: ${currentRemoteUserId}`);
    if (socket && currentRemoteUserId) {
      socket.emit('call:end', { targetUserId: currentRemoteUserId });
    }
    cleanup();
  }, [socket, cleanup]);

  // ─── Toggle mute/video ────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
      setIsMuted((prev) => !prev);
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
      setIsVideoOff((prev) => !prev);
    }
  }, [localStream]);

  // ─── Socket event listeners ───────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onCallInitiate = ({ fromUserId, fromUsername, callType: ct }: {
      fromUserId: string; fromUsername: string; callType: CallType;
    }) => {
      console.log(`[WebRTC] Received call:initiate from ${fromUserId} (${fromUsername})`);
      if (callStateRef.current !== 'idle') {
        console.log(`[WebRTC] Auto-rejecting call, current state is ${callStateRef.current}`);
        // Already in a call, auto-reject
        socket.emit('call:reject', { targetUserId: fromUserId });
        return;
      }
      setIncomingCall({ fromUserId, fromUsername, callType: ct });
      setCallState('incoming');
    };

    const onCallOffer = async ({ fromUserId, offer }: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { targetUserId: fromUserId, answer });
      } catch (err) {
        console.error('[WebRTC] Failed to handle offer:', err);
      }
    };

    const onCallAnswer = async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('connected');
      } catch (err) {
        console.error('[WebRTC] Failed to handle answer:', err);
      }
    };

    const onCallIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    };

    const onCallAccept = async () => {
      const currentRemoteUserId = remoteUserIdRef.current;
      const currentLocalStream = localStreamRef.current;
      
      if (!socket || !currentRemoteUserId || !currentLocalStream) return;
      setCallState('connected');
      
      // Now that the receiver accepted, the CALLER creates the offer
      try {
        const pc = createPeerConnection(currentRemoteUserId);
        currentLocalStream.getTracks().forEach((track) => pc.addTrack(track, currentLocalStream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('call:offer', { targetUserId: currentRemoteUserId, offer });
      } catch (err) {
        console.error('[WebRTC] Failed to create offer after accept:', err);
        cleanup();
      }
    };

    const onCallReject = () => {
      cleanup();
    };

    const onCallEnd = () => {
      cleanup();
    };

    socket.on('call:initiate', onCallInitiate);
    socket.on('call:offer', onCallOffer);
    socket.on('call:answer', onCallAnswer);
    socket.on('call:ice_candidate', onCallIceCandidate);
    socket.on('call:accept', onCallAccept);
    socket.on('call:reject', onCallReject);
    socket.on('call:end', onCallEnd);

    return () => {
      socket.off('call:initiate', onCallInitiate);
      socket.off('call:offer', onCallOffer);
      socket.off('call:answer', onCallAnswer);
      socket.off('call:ice_candidate', onCallIceCandidate);
      socket.off('call:accept', onCallAccept);
      socket.off('call:reject', onCallReject);
      socket.off('call:end', onCallEnd);
    };
  }, [socket, cleanup]);

  const contextValue = useMemo(() => ({
    callState, callType, remoteUserId, remoteUsername,
    localStream, remoteStream, incomingCall,
    isMuted, isVideoOff,
    initiateCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo,
  }), [
    callState, callType, remoteUserId, remoteUsername,
    localStream, remoteStream, incomingCall,
    isMuted, isVideoOff,
    initiateCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo,
  ]);

  return (
    <WebRTCContext.Provider value={contextValue}>
      {children}
    </WebRTCContext.Provider>
  );
}

export function useWebRTC(): UseWebRTCReturn {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
}
