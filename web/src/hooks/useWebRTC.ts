// web/src/hooks/useWebRTC.ts — v2
// KEY CHANGES FROM v1:
//   1. Accepts dynamic iceServers from useIceServers (Twilio TURN credentials)
//   2. Uses useReconnection hook for ICE restart on dropped connections
//   3. Exposes peerConnections Map for useConnectionQuality
//   4. Better error handling with specific error types

'use client';
import { useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { useRoomStore } from '@/store/useRoomStore';
import { useReconnection } from './useReconnection';

interface UseWebRTCProps {
  socket:     Socket | null;
  localStream: MediaStream | null;
  iceServers: RTCIceServer[];   // ← NEW: passed from useIceServers
  enabled:    boolean;
}

interface UseWebRTCReturn {
  broadcastMediaState: (isMuted: boolean, isCameraOff: boolean) => void;
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>; // ← NEW: for quality monitoring
}

export function useWebRTC({ socket, localStream, iceServers, enabled }: UseWebRTCProps): UseWebRTCReturn {
  const { addPeer, removePeer, updatePeerStream, updatePeerMediaState } = useRoomStore();

  // socketId → RTCPeerConnection
  const peerConnections  = useRef<Map<string, RTCPeerConnection>>(new Map());
  // ICE candidates that arrived before setRemoteDescription was called
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Store names for reconnection toasts
  const peerNames        = useRef<Map<string, string>>(new Map());
  // Track which connections WE initiated (needed for ICE restart)
  const initiatorMap     = useRef<Map<string, boolean>>(new Map());

  const { handleConnectionStateChange, clearReconnectTimer } = useReconnection(socket);

  // ── Close a peer connection cleanly ────────────────────────────────────────
  const closePeer = useCallback((socketId: string) => {
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      pc.ontrack              = null;
      pc.onicecandidate       = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peerConnections.current.delete(socketId);
    }
    pendingCandidates.current.delete(socketId);
    clearReconnectTimer(socketId);
    removePeer(socketId);
  }, [removePeer, clearReconnectTimer]);

  // ── Flush ICE candidates buffered before remote description ────────────────
  const flushPending = useCallback(async (socketId: string) => {
    const pc      = peerConnections.current.get(socketId);
    const pending = pendingCandidates.current.get(socketId) ?? [];
    if (!pc || pending.length === 0) return;

    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
    pendingCandidates.current.delete(socketId);
  }, []);

  // ── Create RTCPeerConnection for a remote peer ─────────────────────────────
  const createPeer = useCallback((
    remoteSocketId: string,
    remoteName: string,
    initiator: boolean,
  ): RTCPeerConnection => {

    // Use the dynamically fetched ICE servers (Twilio TURN + STUN)
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    peerConnections.current.set(remoteSocketId, pc);
    peerNames.current.set(remoteSocketId, remoteName);
    initiatorMap.current.set(remoteSocketId, initiator);

    // Add our local tracks so the remote peer sees our video/audio
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Send ICE candidates through the signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && socket) {
        socket.emit('webrtc-ice', { to: remoteSocketId, candidate });
      }
    };

    // When the remote peer's stream arrives, add to store → triggers VideoCard render
    pc.ontrack = ({ streams }) => {
      if (streams[0]) updatePeerStream(remoteSocketId, streams[0]);
    };

    // Monitor connection health — hook into reconnection logic
    pc.onconnectionstatechange = () => {
      handleConnectionStateChange(pc, remoteSocketId, remoteName, initiator);
    };

    // Log ICE gathering state for debugging
    pc.onicegatheringstatechange = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[WebRTC] ICE gathering ${pc.iceGatheringState} for ${remoteName}`);
      }
    };

    // Initiator creates and sends the offer immediately
    if (initiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => socket?.emit('webrtc-offer', { to: remoteSocketId, offer: pc.localDescription }))
        .catch(err => console.error('[WebRTC] createOffer failed:', err));
    }

    return pc;
  }, [socket, localStream, iceServers, updatePeerStream, handleConnectionStateChange]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !enabled) return;

    // Existing peers when WE join → we initiate offers to them
    const onRoomPeers = (peers: Array<{ socketId: string; uid: string; name: string }>) => {
      peers.forEach(peer => {
        addPeer({ socketId: peer.socketId, uid: peer.uid, name: peer.name, stream: null, isMuted: false, isCameraOff: false });
        createPeer(peer.socketId, peer.name, true);
      });
    };

    // New peer joined after us → they'll send offers to us
    const onPeerJoined = ({ socketId, uid, name }: { socketId: string; uid: string; name: string }) => {
      addPeer({ socketId, uid, name, stream: null, isMuted: false, isCameraOff: false });
      createPeer(socketId, name, false);
    };

    // Receive offer → send answer
    const onOffer = async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      let pc = peerConnections.current.get(from);
      if (!pc) {
        const name = peerNames.current.get(from) || 'Peer';
        pc = createPeer(from, name, false);
      }
      await pc.setRemoteDescription(offer);
      await flushPending(from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { to: from, answer: pc.localDescription });
    };

    // Receive answer → finalize connection
    const onAnswer = async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnections.current.get(from);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushPending(from);
    };

    // Receive ICE candidate → add or buffer
    const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnections.current.get(from);
      if (!pc?.remoteDescription) {
        // Buffer until remote description is set
        if (!pendingCandidates.current.has(from)) {
          pendingCandidates.current.set(from, []);
        }
        pendingCandidates.current.get(from)!.push(candidate);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    };

    // Peer left → close connection and remove from UI
    const onPeerLeft = ({ socketId }: { socketId: string }) => {
      closePeer(socketId);
    };

    // Remote peer muted/unmuted camera or mic
    const onMediaState = ({ socketId, isMuted, isCameraOff }: {
      socketId: string; isMuted: boolean; isCameraOff: boolean;
    }) => {
      updatePeerMediaState(socketId, isMuted, isCameraOff);
    };

    socket.on('room-peers',       onRoomPeers);
    socket.on('peer-joined',      onPeerJoined);
    socket.on('webrtc-offer',     onOffer);
    socket.on('webrtc-answer',    onAnswer);
    socket.on('webrtc-ice',       onIce);
    socket.on('peer-left',        onPeerLeft);
    socket.on('peer-media-state', onMediaState);

    return () => {
      socket.off('room-peers',       onRoomPeers);
      socket.off('peer-joined',      onPeerJoined);
      socket.off('webrtc-offer',     onOffer);
      socket.off('webrtc-answer',    onAnswer);
      socket.off('webrtc-ice',       onIce);
      socket.off('peer-left',        onPeerLeft);
      socket.off('peer-media-state', onMediaState);
    };
  }, [socket, enabled, createPeer, closePeer, flushPending, addPeer, updatePeerMediaState]);

  // Close all connections on unmount
  useEffect(() => {
    return () => {
      peerConnections.current.forEach(pc => {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      });
      peerConnections.current.clear();
      pendingCandidates.current.clear();
    };
  }, []);

  const broadcastMediaState = useCallback((isMuted: boolean, isCameraOff: boolean) => {
    socket?.emit('media-state', { isMuted, isCameraOff });
  }, [socket]);

  return { broadcastMediaState, peerConnections };
}
