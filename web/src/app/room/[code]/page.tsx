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
import { useRoomSocial } from '@/hooks/useRoomSocial';
import { leaveRoom } from '@/lib/firestore';
import { formatTime } from '@/lib/utils';

import { VideoGrid } from '@/components/room/VideoGrid';
import { ChatPanel } from '@/components/room/ChatPanel';
import { RoomControls } from '@/components/room/RoomControls';
import { PermissionsGate } from '@/components/room/PermissionsGate';
import { RoomSkeleton } from '@/components/room/RoomSkeleton';
import { RoomError } from '@/components/room/RoomError';
import { ConnectionQualityBadge } from '@/components/room/ConnectionQuality';
import { Pomodoro } from '@/components/room/Pomodoro';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastContainer, toast } from '@/components/ui/Toast';
import { Icon } from '@/components/ui/Icon';

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

  // ── Reactions, raise hand, pomodoro timer (socket-driven) ────────────────
  const { sendReaction, toggleHand, setTimerState } = useRoomSocial({ socket });

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

  // ── Stable refs for media state (avoid stale closures in socket listener) ──
  const isMutedRef      = useRef(isMuted);
  const isCameraOffRef  = useRef(isCameraOff);
  const isSharingRef    = useRef(isSharingScreen);
  useEffect(() => { isMutedRef.current     = isMuted;         }, [isMuted]);
  useEffect(() => { isCameraOffRef.current = isCameraOff;     }, [isCameraOff]);
  useEffect(() => { isSharingRef.current   = isSharingScreen; }, [isSharingScreen]);

  // ── Incoming host-control commands ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handle = ({ action }: { action: string }) => {
      switch (action) {
        case 'mute':
          if (!isMutedRef.current) { toggleMute(); toast('🔇 Host muted your microphone'); }
          break;
        case 'unmute':
          if (isMutedRef.current) { toggleMute(); toast('🎤 Host unmuted your microphone'); }
          break;
        case 'camera-off':
          if (!isCameraOffRef.current) { toggleCamera(); toast('📵 Host turned off your camera'); }
          break;
        case 'camera-on':
          if (isCameraOffRef.current) { toggleCamera(); toast('📷 Host turned on your camera'); }
          break;
        case 'stop-screenshare':
          if (isSharingRef.current) { stopScreenShare(); toast('⏹️ Host stopped your screen share'); }
          break;
      }
    };

    socket.on('host-control', handle);
    return () => { socket.off('host-control', handle); };
  }, [socket, toggleMute, toggleCamera, stopScreenShare]);

  // ── Host sends a control command to a specific participant ────────────────
  const sendHostControl = useCallback((targetSocketId: string, action: string) => {
    socket?.emit('host-control', { targetSocketId, action });
    toast(`✅ Control sent`);
  }, [socket]);

  // ── Host broadcasts a control to everyone in the room ─────────────────────
  const sendHostControlAll = useCallback((action: string) => {
    socket?.emit('host-control-all', { action });
    toast('📢 Command sent to all participants');
  }, [socket]);

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
            <span>{roomCode}</span>
            <button className="copy-btn" onClick={handleCopyCode} title="Copy room code" aria-label="Copy code">
              <Icon name="copy" size={14} />
            </button>
            <button className="copy-btn" onClick={handleShareLink} title="Share invite link" aria-label="Share">
              <Icon name="share" size={14} />
            </button>
          </div>
          <div className="meeting-timer">{formatTime(elapsed)}</div>
          <div className="participants-badge">
            <Icon name="users" size={14} />
            <span>{peerCount}</span>
          </div>
          <ConnectionQualityBadge quality={quality} rtt={rtt} />
        </div>
        <Link href="/profile" className="btn btn-sm btn-ghost">Profile</Link>
      </header>

      {/* Pomodoro study timer — shared across the room */}
      <div className="pomodoro-dock">
        <Pomodoro isHost={student.isHost} onChange={setTimerState} />
      </div>

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
                isHost={student.isHost}
                onHostControl={sendHostControl}
                onHostControlAll={sendHostControlAll}
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
        onToggleHand={toggleHand}
        onReaction={sendReaction}
      />
    </div>
  );
}
