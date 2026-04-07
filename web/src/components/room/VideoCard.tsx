// ─── components/room/VideoCard.tsx ──────────────────────────────────────────
// Single participant tile in the video grid.
// Renders either a live <video> element or an avatar fallback.

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
}

export function VideoCard({
  name, stream, isLocal = false, isScreen = false, isMuted = false, isCameraOff = false,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach the stream to the video element whenever it changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Only update if the stream actually changed
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      // Play is needed on mobile where autoplay is blocked
      video.play().catch(err => {
        // Ignore "play() interrupted" errors (common on mobile)
        if (err.name !== 'AbortError') console.warn('[VideoCard] play() failed:', err);
      });
    }

    return () => {
      // Don't stop the stream on cleanup — just detach from this element
      // The stream lifecycle is managed by useMedia/useWebRTC
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && !isCameraOff;
  const initials = getInitials(name);

  const cardClasses = [
    'video-card',
    isLocal  ? 'local-card'  : '',
    isScreen ? 'screen-card' : '',
    !hasVideo ? 'no-video'   : '',
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
    </div>
  );
}
