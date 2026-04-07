// ─── components/room/VideoGrid.tsx ──────────────────────────────────────────
// Renders the grid of all participant video tiles.
// The grid layout adapts via CSS data-count attribute.

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

  // Total tile count: local + screen share (if any) + remote peers
  const totalCount = 1 + (screenStream ? 1 : 0) + peerList.length;

  return (
    <div className="video-grid" data-count={Math.min(totalCount, 6)}>
      {/* Local user tile */}
      <VideoCard
        name={localName}
        stream={localStream}
        isLocal={true}
        isMuted={localMuted}
        isCameraOff={localCameraOff}
      />

      {/* Screen share tile */}
      {screenStream && (
        <VideoCard
          name="Screen Share"
          stream={screenStream}
          isScreen={true}
        />
      )}

      {/* Remote peers */}
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
