// ─── components/room/VideoGrid.tsx ──────────────────────────────────────────
// Renders the grid of all participant video tiles.
// When screen sharing is active, the screen takes the main view and
// camera tiles become small overlays.

'use client';
import { useRoomStore, type RemotePeer } from '@/store/useRoomStore';
import { VideoCard } from './VideoCard';

interface VideoGridProps {
  localStream: MediaStream | null;
  localName: string;
  localMuted: boolean;
  localCameraOff: boolean;
  screenStream: MediaStream | null;
}

export function VideoGrid({
  localStream, localName, localMuted, localCameraOff, screenStream,
}: VideoGridProps) {
  const peers = useRoomStore(s => s.peers);
  const peerList = [...peers.values()] as RemotePeer[];

  const isScreenSharing = !!screenStream;

  // Total tile count (without screen share tile)
  const participantCount = 1 + peerList.length;

  if (isScreenSharing) {
    // Screen share layout: screen is main, participants are small thumbnails
    return (
      <div className="video-grid screen-active">
        {/* Main screen share area */}
        <div className="screen-main">
          <VideoCard
            name="Screen Share"
            stream={screenStream}
            isScreen={true}
          />
        </div>

        {/* Participant thumbnails sidebar */}
        <div className="screen-participants">
          <VideoCard
            name={localName}
            stream={localStream}
            isLocal={true}
            isMuted={localMuted}
            isCameraOff={localCameraOff}
          />
          {peerList.map(peer => (
            <VideoCard
              key={peer.socketId}
              name={peer.name}
              stream={peer.stream}
              isMuted={peer.isMuted}
              isCameraOff={peer.isCameraOff}
            />
          ))}
        </div>
      </div>
    );
  }

  // Normal layout: standard grid
  return (
    <div className="video-grid" data-count={Math.min(participantCount, 6)}>
      <VideoCard
        name={localName}
        stream={localStream}
        isLocal={true}
        isMuted={localMuted}
        isCameraOff={localCameraOff}
      />
      {peerList.map(peer => (
        <VideoCard
          key={peer.socketId}
          name={peer.name}
          stream={peer.stream}
          isMuted={peer.isMuted}
          isCameraOff={peer.isCameraOff}
        />
      ))}
    </div>
  );
}
