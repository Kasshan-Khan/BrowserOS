'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';
import { useAuthStore } from '@/store/auth.store';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWebRTC(): UseWebRTCReturn {
  const socket = useSocket();
  const { user: currentUser } = useAuthStore();

  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType | null>(null);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [remoteUsername, setRemoteUsername] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallType(null);
    setRemoteUserId(null);
    setRemoteUsername(null);
    setIncomingCall(null);
    pendingCandidatesRef.current = [];
  }, [localStream]);

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
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === 'video',
    };
    return navigator.mediaDevices.getUserMedia(constraints);
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

      const pc = createPeerConnection(targetUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:offer', { targetUserId, offer });
    } catch (err) {
      console.error('[WebRTC] Failed to initiate call:', err);
      cleanup();
    }
  }, [socket, callState, getMediaStream, createPeerConnection, cleanup]);

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
    if (socket && remoteUserId) {
      socket.emit('call:end', { targetUserId: remoteUserId });
    }
    cleanup();
  }, [socket, remoteUserId, cleanup]);

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
      if (callState !== 'idle') {
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

    const onCallAccept = () => {
      setCallState('connected');
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
  }, [socket, callState, cleanup]);

  return {
    callState, callType, remoteUserId, remoteUsername,
    localStream, remoteStream, incomingCall,
    isMuted, isVideoOff,
    initiateCall, acceptCall, rejectCall, endCall,
    toggleMute, toggleVideo,
  };
}
