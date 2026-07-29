// ─── components/room/ChatPanel.tsx ──────────────────────────────────────────
// Real-time chat sidebar powered by Firestore.
// v3 polish: avatar bubbles per sender + HH:MM timestamps + grouped messages.

'use client';
import { useState, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { type ChatMessage } from '@/lib/firestore';
import { avatarGradient, formatChatTime, getInitials } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  currentUid: string;
  isSending: boolean;
}

export function ChatPanel({ messages, onSend, currentUid, isSending }: ChatPanelProps) {
  const [input, setInput]   = useState('');
  const messagesEndRef       = useRef<HTMLDivElement>(null);
  const { chatOpen, toggleChat } = useRoomStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    await onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group consecutive messages by the same sender within a 2-minute window.
  // Only the first message of a group shows the avatar + name + time header.
  type Grouped = ChatMessage & { showHeader: boolean };
  const grouped: Grouped[] = messages.map((msg, i) => {
    const prev = messages[i - 1];
    if (!prev) return { ...msg, showHeader: true };

    const sameSender = prev.senderUid === msg.senderUid;
    const prevTime = msg.createdAt && prev.createdAt
      ? (msg.createdAt.seconds ?? 0) - (prev.createdAt.seconds ?? 0)
      : Infinity;
    const tooFarApart = Math.abs(prevTime) > 120; // 2 min
    return { ...msg, showHeader: !sameSender || tooFarApart };
  });

  return (
    <aside className={`chat-panel${chatOpen ? ' open' : ''}`}>
      <div className="chat-header">
        <span className="chat-header-title"><Icon name="chat" size={16} /> Room Chat</span>
        <button className="icon-btn" onClick={toggleChat} aria-label="Close chat">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="chat-messages">
        <div className="chat-system">Messages are saved for this session</div>

        {grouped.map(msg => {
          const isSelf = msg.senderUid === currentUid;
          const initials = getInitials(msg.senderName || '?');
          const gradient = avatarGradient(msg.senderUid || msg.senderName || 'x');
          const time = formatChatTime(msg.createdAt);

          return (
            <div
              key={msg.id}
              className={`chat-msg${isSelf ? ' self' : ''}${msg.showHeader ? '' : ' chat-msg-follow'}`}
            >
              {/* Left: avatar (only first msg in a group, hidden for self) */}
              {!isSelf && (
                msg.showHeader ? (
                  <div className="chat-avatar" style={{ background: gradient }} title={msg.senderName}>
                    {initials}
                  </div>
                ) : (
                  <div className="chat-avatar-spacer" aria-hidden="true" />
                )
              )}

              <div className="chat-bubble-wrap">
                {msg.showHeader && (
                  <div className="chat-meta">
                    <span className="chat-from">{isSelf ? 'You' : msg.senderName}</span>
                    {time && <span className="chat-time">· {time}</span>}
                  </div>
                )}
                {/* React auto-escapes textContent — no XSS risk */}
                <span className="chat-text">{msg.text}</span>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Type a message…"
          maxLength={500}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSend}
          disabled={!input.trim() || isSending}
        >
          Send
        </button>
      </div>
    </aside>
  );
}
