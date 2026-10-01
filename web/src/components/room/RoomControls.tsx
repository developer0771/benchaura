// ─── components/room/RoomControls.tsx — v3 modern floating pill bar ───────
// Clean SVG icons, floating glassmorphic container, auto-hiding labels on mobile.
// v3.1 adds:
//   • Raise-hand toggle button
//   • Reactions palette (pops above the bar)

'use client';
import { useState } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { Icon } from '@/components/ui/Icon';

interface RoomControlsProps {
  isMuted:        boolean;
  isCameraOff:    boolean;
  isSharingScreen:boolean;
  onToggleMute:   () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onLeave:        () => void;
  // Social
  onToggleHand:   () => void;
  onReaction:     (emoji: string) => void;
}

const REACTIONS = ['👍', '❤️', '😂', '🔥', '👏', '🎉', '🤔', '💡'];

export function RoomControls({
  isMuted, isCameraOff, isSharingScreen,
  onToggleMute, onToggleCamera, onToggleScreen, onLeave,
  onToggleHand, onReaction,
}: RoomControlsProps) {
  const { chatOpen, toggleChat, unreadCount, localHandRaised } = useRoomStore();
  const [palette, setPalette] = useState(false);

  function handlePick(emoji: string) {
    onReaction(emoji);
    setPalette(false);
  }

  return (
    <footer className="room-controls">
      {/* Reactions palette — appears above the pill when open */}
      {palette && (
        <div className="reaction-palette" role="menu" aria-label="Send a reaction">
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              className="reaction-chip"
              onClick={() => handlePick(emoji)}
              aria-label={`Send ${emoji} reaction`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      )}

      <div className="controls-group" role="toolbar" aria-label="Call controls">
        <button
          className={`ctrl-btn${isMuted ? ' active' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          aria-pressed={isMuted}
        >
          <span className="ctrl-icon">
            <Icon name={isMuted ? 'micOff' : 'mic'} size={19} />
          </span>
          <span className="ctrl-label">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          className={`ctrl-btn${isCameraOff ? ' active' : ''}`}
          onClick={onToggleCamera}
          title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
          aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
          aria-pressed={isCameraOff}
        >
          <span className="ctrl-icon">
            <Icon name={isCameraOff ? 'videoOff' : 'video'} size={19} />
          </span>
          <span className="ctrl-label">{isCameraOff ? 'Start cam' : 'Camera'}</span>
        </button>

        <button
          className={`ctrl-btn${isSharingScreen ? ' active' : ''}`}
          onClick={onToggleScreen}
          title={isSharingScreen ? 'Stop sharing' : 'Share screen'}
          aria-label={isSharingScreen ? 'Stop sharing screen' : 'Share screen'}
          aria-pressed={isSharingScreen}
        >
          <span className="ctrl-icon">
            <Icon name={isSharingScreen ? 'screenStop' : 'screen'} size={19} />
          </span>
          <span className="ctrl-label">{isSharingScreen ? 'Stop share' : 'Present'}</span>
        </button>

        <button
          className={`ctrl-btn ctrl-hand${localHandRaised ? ' active' : ''}`}
          onClick={onToggleHand}
          title={localHandRaised ? 'Lower hand' : 'Raise hand'}
          aria-label={localHandRaised ? 'Lower hand' : 'Raise hand'}
          aria-pressed={localHandRaised}
        >
          <span className="ctrl-icon">
            <Icon name="hand" size={19} filled={localHandRaised} />
          </span>
          <span className="ctrl-label">{localHandRaised ? 'Lower' : 'Raise'}</span>
        </button>

        <button
          className={`ctrl-btn ctrl-react${palette ? ' active' : ''}`}
          onClick={() => setPalette(p => !p)}
          title="Send a reaction"
          aria-label="Send a reaction"
          aria-haspopup="menu"
          aria-expanded={palette}
        >
          <span className="ctrl-icon">
            <Icon name="smile" size={19} />
          </span>
          <span className="ctrl-label">React</span>
        </button>

        <button
          className={`ctrl-btn${chatOpen ? ' active' : ''}`}
          onClick={toggleChat}
          title="Toggle chat panel"
          aria-label="Toggle chat"
          aria-pressed={chatOpen}
        >
          <span className="ctrl-icon">
            <Icon name="chat" size={19} />
          </span>
          <span className="ctrl-label">Chat</span>
          {unreadCount > 0 && (
            <span className="chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      </div>

      <button
        className="leave-btn"
        onClick={onLeave}
        title="Leave room"
        aria-label="Leave room"
      >
        <Icon name="phoneOff" size={18} />
        <span className="ctrl-label">Leave</span>
      </button>
    </footer>
  );
}
