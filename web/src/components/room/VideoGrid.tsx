// ─── components/room/VideoGrid.tsx ──────────────────────────────────────────
// Renders the grid of all participant video tiles.
//
// SCREEN SHARE LAYOUT:
//   When anyone is screen-sharing (local or remote), the share becomes the
//   main view and camera tiles become a sidebar. We pick the first screen
//   track we find — local first, otherwise the first remote peer that's
//   sharing.
//
// HOST CONTROLS:
//   When isHost === true, each remote tile surfaces mute / camera-off / stop
//   -share buttons that emit host-control socket events.

'use client';
import type { LocalVideoTrack } from 'livekit-client';
import { useRoomStore, type RemotePeer } from '@/store/useRoomStore';
import { VideoCard } from './VideoCard';
import { Icon } from '@/components/ui/Icon';

interface VideoGridProps {
  localName: string;
  localVideoTrack: LocalVideoTrack | null;
  localScreenTrack: LocalVideoTrack | null;
  localMuted: boolean;
  localCameraOff: boolean;
  isHost?: boolean;
  onHostControl?: (targetSocketId: string, action: string) => void;
  onHostControlAll?: (action: string) => void;
}

export function VideoGrid({
  localName,
  localVideoTrack, localScreenTrack,
  localMuted, localCameraOff,
  isHost = false, onHostControl, onHostControlAll,
}: VideoGridProps) {
  const peers = useRoomStore(s => s.peers);
  const peerList = [...peers.values()] as RemotePeer[];

  // Which screen to feature? Prefer local share, else first remote sharer.
  const remoteScreenPeer = peerList.find(p => p.screenTrack);
  const activeScreenTrack = localScreenTrack ?? remoteScreenPeer?.screenTrack ?? null;
  const activeScreenName  = localScreenTrack ? `${localName} (screen)` : remoteScreenPeer ? `${remoteScreenPeer.name} (screen)` : '';

  const isScreenSharing = !!activeScreenTrack;
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
          <VideoCard
            name={activeScreenName || 'Screen Share'}
            videoTrack={activeScreenTrack}
            isScreen={true}
          />
        </div>

        {/* Participant thumbnails sidebar */}
        <div className="screen-participants">
          <VideoCard
            name={localName}
            videoTrack={localVideoTrack}
            isLocal={true}
            isMuted={localMuted}
            isCameraOff={localCameraOff}
          />
          {peerList.map(peer => (
            <VideoCard
              key={peer.socketId}
              socketId={peer.socketId}
              name={peer.name}
              videoTrack={peer.videoTrack}
              audioTrack={peer.audioTrack}
              isMuted={peer.isMuted}
              isCameraOff={peer.isCameraOff}
              isSpeaking={peer.isSpeaking}
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
        videoTrack={localVideoTrack}
        isLocal={true}
        isMuted={localMuted}
        isCameraOff={localCameraOff}
      />
      {peerList.map(peer => (
        <VideoCard
          key={peer.socketId}
          socketId={peer.socketId}
          name={peer.name}
          videoTrack={peer.videoTrack}
          audioTrack={peer.audioTrack}
          isMuted={peer.isMuted}
          isCameraOff={peer.isCameraOff}
          isSpeaking={peer.isSpeaking}
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
