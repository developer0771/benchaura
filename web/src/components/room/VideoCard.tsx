// ─── components/room/VideoCard.tsx ──────────────────────────────────────────
// Single participant tile in the video grid.
// Renders either a live <video> element or an avatar fallback.
// Overlays: host controls (when viewer is host), raised-hand indicator,
// floating reactions.

'use client';
import { useEffect, useMemo, useRef } from 'react';
import { getInitials } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { useRoomStore } from '@/store/useRoomStore';

interface VideoCardProps {
  /** socketId is used to match raised hands and reactions. Omit for local & screen. */
  socketId?: string;
  name: string;
  stream: MediaStream | null;
  isLocal?: boolean;
  isScreen?: boolean;
  isMuted?: boolean;
  isCameraOff?: boolean;
  // Host-control callbacks (only provided when the viewer is the room host)
  isHost?: boolean;
  onMute?: () => void;
  onCameraOff?: () => void;
  onStopShare?: () => void;
}

export function VideoCard({
  socketId, name, stream,
  isLocal = false, isScreen = false,
  isMuted = false, isCameraOff = false,
  isHost = false, onMute, onCameraOff, onStopShare,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Store state — which hand is raised, active reactions for this tile
  const raisedHands    = useRoomStore(s => s.raisedHands);
  const reactions      = useRoomStore(s => s.reactions);
  const localHandRaised = useRoomStore(s => s.localHandRaised);

  // Match the identifier for reactions / hand overlay.
  // Local tile has no socketId, so we use a sentinel "__self__".
  const matchId = isLocal ? '__self__' : socketId;
  const handRaised = isLocal
    ? localHandRaised
    : (socketId ? raisedHands.has(socketId) : false);

  const myReactions = useMemo(
    () => reactions.filter(r => (isLocal ? false : r.socketId === matchId)),
    [reactions, isLocal, matchId]
  );

  // Attach the stream to the video element whenever it changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(err => {
        if (err.name !== 'AbortError') console.warn('[VideoCard] play() failed:', err);
      });
    }

    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && !isCameraOff;
  const initials = getInitials(name);

  // Show host controls if host and callbacks exist and it's not local/screen tile
  const showHostControls = isHost && !isLocal && !isScreen && (onMute || onCameraOff);

  const cardClasses = [
    'video-card',
    isLocal        ? 'local-card'   : '',
    isScreen       ? 'screen-card'  : '',
    !hasVideo      ? 'no-video'     : '',
    showHostControls ? 'host-managed' : '',
    handRaised     ? 'hand-raised'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Always mute local video to prevent echo
        />
      ) : (
        <div className="avatar-placeholder">{initials}</div>
      )}

      <div className="video-name">
        {isScreen && <Icon name="screen" size={12} />}
        {isScreen ? <span style={{ marginLeft: 4 }}>Screen share</span> : name}
      </div>

      {!isScreen && (
        <div className={`mic-indicator${isMuted ? ' muted' : ''}`} title={isMuted ? 'Muted' : 'Mic on'}>
          <Icon name={isMuted ? 'micOff' : 'mic'} size={14} />
        </div>
      )}

      {/* ── Raised hand badge ──────────────────────────────────────────── */}
      {handRaised && !isScreen && (
        <div className="hand-badge" title={`${isLocal ? 'You' : name} raised a hand`}>
          <span className="hand-badge-emoji">✋</span>
        </div>
      )}

      {/* ── Floating reactions ─────────────────────────────────────────── */}
      {!isScreen && myReactions.length > 0 && (
        <div className="reaction-layer" aria-live="polite">
          {myReactions.map(r => (
            <span key={r.id} className="reaction-float">{r.emoji}</span>
          ))}
        </div>
      )}

      {/* ── Host control overlay ───────────────────────────────────────── */}
      {showHostControls && (
        <div className="host-controls-overlay">
          {onMute && (
            <button
              className={`hc-btn${isMuted ? ' hc-active' : ''}`}
              onClick={onMute}
              title={isMuted ? 'Unmute participant' : 'Mute participant'}
              aria-label={isMuted ? 'Unmute participant' : 'Mute participant'}
            >
              <Icon name={isMuted ? 'mic' : 'micOff'} size={14} />
            </button>
          )}
          {onCameraOff && (
            <button
              className={`hc-btn${isCameraOff ? ' hc-active' : ''}`}
              onClick={onCameraOff}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              <Icon name={isCameraOff ? 'video' : 'videoOff'} size={14} />
            </button>
          )}
          {onStopShare && (
            <button
              className="hc-btn hc-danger"
              onClick={onStopShare}
              title="Stop screen share"
              aria-label="Stop screen share"
            >
              <Icon name="screenStop" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
