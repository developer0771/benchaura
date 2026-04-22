// web/src/app/room/[code]/page.tsx — v3 (LiveKit SFU)
//
// WHAT CHANGED FROM v2:
//   • Media no longer flows over a WebRTC mesh via our Socket.io server.
//     Instead, useLiveKit connects to a LiveKit SFU, publishes camera + mic
//     once, and subscribes to remote tracks. Socket.io stays for presence,
//     chat, host controls, reactions, raise-hand, and the Pomodoro timer.
//   • useMedia / useWebRTC / useIceServers / useConnectionQuality /
//     useReconnection are retired — their responsibilities now live inside
//     useLiveKit (+ native LiveKit reconnection).
//   • VideoGrid receives LiveKit tracks instead of MediaStreams.
//   • Screen share uses LiveKit's publishTrack(source=ScreenShare).

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuthStore } from '@/store/useAuthStore';
import { useRoomStore } from '@/store/useRoomStore';
import { useSocket } from '@/hooks/useSocket';
import { useLiveKit } from '@/hooks/useLiveKit';
import { useChat } from '@/hooks/useChat';
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

  // ── Socket (presence, chat, reactions, host controls) ────────────────────
  const { socket, isConnected, socketError, clearError } = useSocket();

  // ── LiveKit (media) ───────────────────────────────────────────────────────
  // Note: localAudioTrack is intentionally unused in the grid — LiveKit
  // publishes it to the SFU for us and we don't render it in the local
  // tile (would cause echo).
  const {
    connectionQuality,
    isConnected: lkConnected,
    error: lkError,
    localVideoTrack, localScreenTrack,
    permission,
    isMuted, isCameraOff, isSharingScreen,
    requestCamera, requestAudioOnly,
    toggleMute, toggleCamera,
    startScreenShare, stopScreenShare,
    disconnect: lkDisconnect,
  } = useLiveKit({
    roomCode,
    displayName: student?.name ?? 'Guest',
    isHost:      !!student?.isHost,
    enabled:     !!student,
  });

  // ── Join signaling room (for presence + chat/reactions/timer) ────────────
  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!socket || !isConnected || !student || hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    socket.emit('join-room', { roomCode, name: student.name });
    toast(`🎉 Joined room ${roomCode}`);
  }, [socket, isConnected, student, roomCode]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const { messages, send, isSending } = useChat({
    roomCode,
    uid:  student?.uid  ?? '',
    name: student?.name ?? 'Unknown',
  });

  // ── Reactions, raise hand, pomodoro (socket-driven) ──────────────────────
  const { sendReaction, toggleHand, setTimerState } = useRoomSocial({ socket });

  // ── Peer count (LiveKit-backed) ──────────────────────────────────────────
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

  // ── Toggle mute / camera (wrapped to add toasts) ──────────────────────────
  const handleToggleMute = useCallback(async () => {
    await toggleMute();
    // Note: isMuted state is stale until next render, so invert here.
    toast(!isMuted ? '🔇 Microphone off' : '🎤 Microphone on');
  }, [toggleMute, isMuted]);

  const handleToggleCamera = useCallback(async () => {
    await toggleCamera();
    toast(!isCameraOff ? '📵 Camera off' : '📷 Camera on');
  }, [toggleCamera, isCameraOff]);

  // ── Screen share ─────────────────────────────────────────────────────────
  const handleToggleScreen = useCallback(async () => {
    if (isSharingScreen) {
      await stopScreenShare();
      toast('⏹️ Screen sharing stopped');
    } else {
      await startScreenShare();
      if (isSharingScreen) toast('🖥️ Screen sharing started');
    }
  }, [isSharingScreen, startScreenShare, stopScreenShare]);

  // ── Stable refs for media state (avoid stale closures) ────────────────────
  const isMutedRef      = useRef(isMuted);
  const isCameraOffRef  = useRef(isCameraOff);
  const isSharingRef    = useRef(isSharingScreen);
  useEffect(() => { isMutedRef.current     = isMuted;         }, [isMuted]);
  useEffect(() => { isCameraOffRef.current = isCameraOff;     }, [isCameraOff]);
  useEffect(() => { isSharingRef.current   = isSharingScreen; }, [isSharingScreen]);

  // ── Incoming host-control commands (still over our Socket.io) ────────────
  useEffect(() => {
    if (!socket) return;

    const handle = ({ action }: { action: string }) => {
      switch (action) {
        case 'mute':
          if (!isMutedRef.current) { void toggleMute(); toast('🔇 Host muted your microphone'); }
          break;
        case 'unmute':
          if (isMutedRef.current)  { void toggleMute(); toast('🎤 Host unmuted your microphone'); }
          break;
        case 'camera-off':
          if (!isCameraOffRef.current) { void toggleCamera(); toast('📵 Host turned off your camera'); }
          break;
        case 'camera-on':
          if (isCameraOffRef.current)  { void toggleCamera(); toast('📷 Host turned on your camera'); }
          break;
        case 'stop-screenshare':
          if (isSharingRef.current) { void stopScreenShare(); toast('⏹️ Host stopped your screen share'); }
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
    await lkDisconnect().catch(() => {});
    socket?.disconnect();
    await leaveRoom(roomCode, student.uid, student.isHost).catch(() => {});
    toast('👋 Left the room');
    setTimeout(() => router.push('/'), 400);
  }, [student, lkDisconnect, socket, roomCode, router]);

  if (!student) return null;

  const mediaReady = permission === 'granted' || permission === 'skipped';
  const showSkeleton = mediaReady && !lkConnected && !lkError;

  // Quality badge — LiveKit returns a 4-state enum; map to the existing
  // ConnectionQualityBadge shape (unknown/good/degraded/poor/failed).
  const badgeQuality: 'unknown' | 'good' | 'degraded' | 'poor' | 'failed' =
    connectionQuality === 'unknown'    ? 'unknown'
    : connectionQuality === 'excellent' ? 'good'
    : connectionQuality === 'good'      ? 'good'
    : connectionQuality === 'poor'      ? 'poor'
    : connectionQuality === 'lost'      ? 'failed'
    : 'degraded';

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

      {/* LiveKit connect error */}
      {lkError && (
        <RoomError
          error={{ code: 'LIVEKIT_ERROR', message: lkError }}
          onDismiss={() => window.location.reload()}
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
          <ConnectionQualityBadge quality={badgeQuality} rtt={null} />
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
          <ErrorBoundary
            fallback={
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:16 }}>
                <div style={{ fontSize:40 }}>⚠️</div>
                <p style={{ color:'var(--text-muted)' }}>Video error — try refreshing the page</p>
                <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Refresh</button>
              </div>
            }
          >
            {showSkeleton ? (
              <RoomSkeleton />
            ) : mediaReady ? (
              <VideoGrid
                localName={student.name}
                localVideoTrack={localVideoTrack}
                localScreenTrack={localScreenTrack}
                localMuted={isMuted}
                localCameraOff={isCameraOff}
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
