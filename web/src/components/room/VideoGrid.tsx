// ─── components/room/VideoGrid.tsx ──────────────────────────────────────────
// Renders the grid of all participant video tiles.
// When screen sharing is active, the screen takes the main view and
// camera tiles become small overlays.
// When isHost === true, each remote tile has mute / camera-off controls.

'use client';
import { useRoomStore, type RemotePeer } from '@/store/useRoomStore';
import { VideoCard } from './VideoCard';
import { Icon } from '@/components/ui/Icon';

interface VideoGridProps {
  localStream: MediaStream | null;
  localName: string;
  localMuted: boolean;
  localCameraOff: boolean;
  screenStream: MediaStream | null;
  isHost?: boolean;
  onHostControl?: (targetSocketId: string, action: string) => void;
  onHostControlAll?: (action: string) => void;
}

export function VideoGrid({
  localStream, localName, localMuted, localCameraOff, screenStream,
  isHost = false, onHostControl, onHostControlAll,
}: VideoGridProps) {
  const peers = useRoomStore(s => s.peers);
  const peerList = [...peers.values()] as RemotePeer[];

  const isScreenSharing = !!screenStream;
  const participantCount = 1 + peerList.length;

  const makeControls = (peer: RemotePeer) =>
    isHost && onHostControl
      ? {
          onMute:      () => onHostControl(peer.socketId, peer.isMuted      ? 'unmute'     : 'mute'),
          onCameraOff: () => onHostControl(peer.socketId, peer.isCameraOff  ? 'camera-on'  : 'camera-off'),
          onStopShare: () => onHostControl(peer.socketId, 'stop-screenshare'),
        }
      : {};

  if (isScreenSharing) {
    return (
      <div className="video-grid screen-active">
        {/* Main screen share area */}
        <div className="screen-main">
          <VideoCard name="Screen Share" stream={screenStream} isScreen={true} />
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
              socketId={peer.socketId}
              name={peer.name}
              stream={peer.stream}
              isMuted={peer.isMuted}
              isCameraOff={peer.isCameraOff}
              isHost={isHost}
              {...makeControls(peer)}
            />
          ))}
        </div>

        {/* Host: mute-all banner when screen sharing */}
        {isHost && peerList.length > 0 && onHostControlAll && (
          <div className="host-global-bar">
            <span className="host-badge"><Icon name="crown" size={13} filled /> Host</span>
            <button className="host-global-btn" onClick={() => onHostControlAll('mute')}>
              <Icon name="micOff" size={13} /> Mute all
            </button>
            <button className="host-global-btn" onClick={() => onHostControlAll('camera-off')}>
              <Icon name="videoOff" size={13} /> Cameras off
            </button>
          </div>
        )}
      </div>
    );
  }

  // Normal grid layout
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
          isHost={isHost}
          {...makeControls(peer)}
        />
      ))}

      {/* Host: global controls bar (shown when there are other participants) */}
      {isHost && peerList.length > 0 && onHostControlAll && (
        <div className="host-global-bar">
          <span className="host-badge"><Icon name="crown" size={13} filled /> Host</span>
          <button className="host-global-btn" onClick={() => onHostControlAll('mute')}>
            <Icon name="micOff" size={13} /> Mute all
          </button>
          <button className="host-global-btn" onClick={() => onHostControlAll('camera-off')}>
            <Icon name="videoOff" size={13} /> Cameras off
          </button>
          <button className="host-global-btn" onClick={() => onHostControlAll('stop-screenshare')}>
            <Icon name="screenStop" size={13} /> Stop shares
          </button>
        </div>
      )}
    </div>
  );
}
