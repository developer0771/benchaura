// ─── components/room/RoomControls.tsx ───────────────────────────────────────
// Bottom control bar: mic, camera, screen share, chat, leave.

'use client';
import { useRoomStore } from '@/store/useRoomStore';

interface RoomControlsProps {
  isMuted:        boolean;
  isCameraOff:    boolean;
  isSharingScreen:boolean;
  onToggleMute:   () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onLeave:        () => void;
}

export function RoomControls({
  isMuted, isCameraOff, isSharingScreen,
  onToggleMute, onToggleCamera, onToggleScreen, onLeave,
}: RoomControlsProps) {
  const { chatOpen, toggleChat, unreadCount } = useRoomStore();

  return (
    <footer className="room-controls">
      <div className="controls-group">
        {/* Microphone */}
        <button
          className={`ctrl-btn${isMuted ? ' active' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          <span className="ctrl-icon">{isMuted ? '🔇' : '🎤'}</span>
          <span className="ctrl-label">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* Camera */}
        <button
          className={`ctrl-btn${isCameraOff ? ' active' : ''}`}
          onClick={onToggleCamera}
          title={isCameraOff ? 'Start Camera' : 'Stop Camera'}
        >
          <span className="ctrl-icon">{isCameraOff ? '📵' : '📷'}</span>
          <span className="ctrl-label">{isCameraOff ? 'Start Cam' : 'Camera'}</span>
        </button>

        {/* Screen share */}
        <button
          className={`ctrl-btn${isSharingScreen ? ' active' : ''}`}
          onClick={onToggleScreen}
          title={isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
        >
          <span className="ctrl-icon">{isSharingScreen ? '⏹️' : '🖥️'}</span>
          <span className="ctrl-label">{isSharingScreen ? 'Stop' : 'Screen Share'}</span>
        </button>

        {/* Chat */}
        <button
          className={`ctrl-btn${chatOpen ? ' active' : ''}`}
          onClick={toggleChat}
          title="Toggle Chat"
        >
          <span className="ctrl-icon">💬</span>
          <span className="ctrl-label">Chat</span>
          {unreadCount > 0 && (
            <span className="chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      </div>

      {/* Leave */}
      <button className="ctrl-btn leave-btn" onClick={onLeave} title="Leave Room">
        <span className="ctrl-icon">📵</span>
        <span className="ctrl-label">Leave</span>
      </button>
    </footer>
  );
}
