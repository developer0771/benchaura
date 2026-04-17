// ─── components/room/VideoCard.tsx ──────────────────────────────────────────
// Single participant tile in the video grid.
// Renders either a live <video> element or an avatar fallback.
// When isHost===true and callbacks are provided, shows host control overlay.

'use client';
import { useEffect, useRef } from 'react';
import { getInitials } from '@/lib/utils';

interface VideoCardProps {
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
  name, stream,
  isLocal = false, isScreen = false,
  isMuted = false, isCameraOff = false,
  isHost = false, onMute, onCameraOff, onStopShare,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

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
        {isScreen ? '🖥️ Screen Share' : name}
        {isLocal && !isScreen && ' (You)'}
      </div>

      {!isScreen && (
        <div className={`mic-indicator${isMuted ? ' muted' : ''}`}>
          {isMuted ? '🔇' : '🎤'}
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
            >
              {isMuted ? '🎤' : '🔇'}
            </button>
          )}
          {onCameraOff && (
            <button
              className={`hc-btn${isCameraOff ? ' hc-active' : ''}`}
              onClick={onCameraOff}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCameraOff ? '📷' : '📵'}
            </button>
          )}
          {onStopShare && (
            <button
              className="hc-btn hc-danger"
              onClick={onStopShare}
              title="Stop screen share"
            >
              ⏹️
            </button>
          )}
        </div>
      )}
    </div>
  );
}
