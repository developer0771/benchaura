// web/src/app/room/[code]/page.tsx — v2
// All v2 upgrades wired together:
//   ✅ Dynamic TURN credentials via useIceServers
//   ✅ Firebase token sent with socket (via useSocket v2)
//   ✅ Connection quality monitoring
//   ✅ Reconnection handling
//   ✅ ErrorBoundary around video grid
//   ✅ RoomSkeleton loading state
//   ✅ RoomError overlay for socket errors
//   ✅ Structured error handling for all room events

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuthStore } from '@/store/useAuthStore';
import { useRoomStore } from '@/store/useRoomStore';
import { useMedia } from '@/hooks/useMedia';
import { useSocket } from '@/hooks/useSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useChat } from '@/hooks/useChat';
import { useIceServers } from '@/hooks/useIceServers';
import { useConnectionQuality } from '@/hooks/useConnectionQuality';
import { leaveRoom } from '@/lib/firestore';
import { formatTime } from '@/lib/utils';

import { VideoGrid } from '@/components/room/VideoGrid';
import { ChatPanel } from '@/components/room/ChatPanel';
import { RoomControls } from '@/components/room/RoomControls';
import { PermissionsGate } from '@/components/room/PermissionsGate';
import { RoomSkeleton } from '@/components/room/RoomSkeleton';
import { RoomError } from '@/components/room/RoomError';
import { ConnectionQualityBadge } from '@/components/room/ConnectionQuality';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastContainer, toast } from '@/components/ui/Toast';

interface RoomPageProps {
  params: { code: string };
}

export default function RoomPage({ params }: RoomPageProps) {
  const { code: roomCode } = params;
  const router = useRouter();
  const { student } = useAuthStore();

  // ── Guard: redirect if not authenticated ──────────────────────────────────
  useEffect(() => {
    if (!student) router.replace('/join');
  }, [student, router]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRoomStore(s => s.startTime);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);

  // ── Screen share ──────────────────────────────────────────────────────────
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // ── Local media ───────────────────────────────────────────────────────────
  const {
    localStream, permission,
    isMuted, isCameraOff,
    requestCamera, requestAudioOnly,
    toggleMute, toggleCamera, stopAll,
  } = useMedia();

  // ── Dynamic TURN credentials ──────────────────────────────────────────────
  const { iceServers, isLoading: iceLoading } = useIceServers();

  // ── Socket (sends Firebase token in handshake) ────────────────────────────
  const { socket, isConnected, socketError, clearError } = useSocket();

  // ── WebRTC (uses dynamic ICE servers, exposes peerConnections for quality) ─
  const mediaReady = permission === 'granted' || permission === 'skipped';
  const { broadcastMediaState, peerConnections } = useWebRTC({
    socket,
    localStream,
    iceServers,               // ← Twilio TURN credentials
    enabled: mediaReady && !iceLoading,
  });

  // ── Connection quality monitor ─────────────────────────────────────────────
  const { quality, rtt } = useConnectionQuality(peerConnections.current);

  // ── Broadcast local media state changes ───────────────────────────────────
  useEffect(() => {
    broadcastMediaState(isMuted, isCameraOff);
  }, [isMuted, isCameraOff, broadcastMediaState]);

  // ── Join signaling room once everything is ready ──────────────────────────
  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!socket || !isConnected || !student || !localStream || hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    socket.emit('join-room', { roomCode, name: student.name });
    toast(`🎉 Joined room ${roomCode}`);
  }, [socket, isConnected, student, localStream, roomCode]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const { messages, send, isSending } = useChat({
    roomCode,
    uid:  student?.uid  ?? '',
    name: student?.name ?? 'Unknown',
  });

  // ── Peer count ────────────────────────────────────────────────────────────
  const peers     = useRoomStore(s => s.peers);
  const peerCount = peers.size + 1;

  // ── Copy room code ────────────────────────────────────────────────────────
  function handleCopyCode() {
    navigator.clipboard.writeText(roomCode).then(() => toast('Room code copied!'));
  }

  // ── Share invite link ────────────────────────────────────────────────────
  function handleShareLink() {
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/join?room=${roomCode}`;

    if (navigator.share) {
      navigator.share({
        title: 'Join my Benchaura room',
        text: `Join my study room on Benchaura! Room code: ${roomCode}`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => toast('🔗 Invite link copied!'));
    }
  }

  // ── Toggle mute ───────────────────────────────────────────────────────────
  function handleToggleMute() {
    toggleMute();
    toast(isMuted ? '🎤 Microphone on' : '🔇 Microphone off');
  }

  // ── Toggle camera ─────────────────────────────────────────────────────────
  function handleToggleCamera() {
    toggleCamera();
    toast(isCameraOff ? '📷 Camera on' : '📵 Camera off');
  }

  // ── Screen share ──────────────────────────────────────────────────────────
  const { setSharing, isSharingScreen } = useRoomStore();

  // Replace video track on all peer connections with the given track
  const replaceTrackOnPeers = useCallback((newTrack: MediaStreamTrack) => {
    peerConnections.current.forEach((pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack).catch(console.error);
      }
    });
  }, [peerConnections]);

  const stopScreenShare = useCallback(() => {
    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
    setSharing(false);
    // Restore camera track on all peer connections
    const cameraTrack = localStream?.getVideoTracks()[0];
    if (cameraTrack) replaceTrackOnPeers(cameraTrack);
    toast('⏹️ Screen sharing stopped');
  }, [screenStream, setSharing, localStream, replaceTrackOnPeers]);

  const handleToggleScreen = useCallback(async () => {
    if (isSharingScreen) {
      stopScreenShare();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      setScreenStream(stream);
      setSharing(true);

      // Replace camera track with screen track on all peer connections
      const screenTrack = stream.getVideoTracks()[0];
      replaceTrackOnPeers(screenTrack);

      toast('🖥️ Screen sharing started');

      // Handle user clicking browser's "Stop sharing" button
      screenTrack.addEventListener('ended', () => {
        stopScreenShare();
      });
    } catch {
      toast('Screen sharing cancelled');
    }
  }, [isSharingScreen, setSharing, replaceTrackOnPeers, stopScreenShare]);

  // ── Leave room ────────────────────────────────────────────────────────────
  const handleLeave = useCallback(async () => {
    if (!student) return;
    stopAll();
    screenStream?.getTracks().forEach(t => t.stop());
    socket?.disconnect();
    await leaveRoom(roomCode, student.uid, student.isHost).catch(() => {});
    toast('👋 Left the room');
    setTimeout(() => router.push('/'), 400);
  }, [student, stopAll, screenStream, socket, roomCode, router]);

  if (!student) return null;

  const showSkeleton = iceLoading || (mediaReady && peerCount === 1 && !isConnected);

  return (
    <div className="page-room">
      <ToastContainer />

      {/* Socket error overlay */}
      {socketError && (
        <RoomError
          error={socketError}
          onDismiss={
            ['CONNECTION_ERROR', 'SERVER_SHUTDOWN'].includes(socketError.code)
              ? clearError
              : undefined
          }
        />
      )}

      {/* Camera permissions overlay */}
      {permission === 'pending' && (
        <PermissionsGate
          onAllowCamera={async () => { await requestCamera(); toast('📷 Camera connected'); }}
          onAudioOnly={async () => { await requestAudioOnly(); toast('🎤 Audio only'); }}
        />
      )}

      {/* Top bar */}
      <header className="room-topbar">
        <div className="room-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">Benchaura</span>
        </div>
        <div className="room-meta">
          <div className="room-code-badge">
            <span style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{roomCode}</span>
            <button className="copy-btn" onClick={handleCopyCode} title="Copy code">📋</button>
            <button className="copy-btn" onClick={handleShareLink} title="Share invite link">🔗</button>
          </div>
          <div className="meeting-timer">{formatTime(elapsed)}</div>
          <div className="participants-badge">
            <span>👥</span>
            <span>{peerCount}</span>
          </div>
          {/* v2: connection quality badge */}
          <ConnectionQualityBadge quality={quality} rtt={rtt} />
        </div>
        <Link href="/profile" className="btn btn-sm btn-ghost">Profile</Link>
      </header>

      {/* Main layout */}
      <div className="room-layout">
        <main className="video-area">
          {/* v2: ErrorBoundary catches render errors in video grid */}
          <ErrorBoundary
            fallback={
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:16 }}>
                <div style={{ fontSize:40 }}>⚠️</div>
                <p style={{ color:'var(--text-muted)' }}>Video error — try refreshing the page</p>
                <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Refresh</button>
              </div>
            }
          >
            {/* v2: loading skeleton while ICE servers fetch */}
            {showSkeleton ? (
              <RoomSkeleton />
            ) : mediaReady ? (
              <VideoGrid
                localStream={localStream}
                localName={student.name}
                localMuted={isMuted}
                localCameraOff={isCameraOff}
                screenStream={screenStream}
              />
            ) : null}
          </ErrorBoundary>
        </main>

        <ChatPanel
          messages={messages}
          onSend={send}
          currentUid={student.uid}
          isSending={isSending}
        />
      </div>

      <RoomControls
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isSharingScreen={isSharingScreen}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleScreen={handleToggleScreen}
        onLeave={handleLeave}
      />
    </div>
  );
}
