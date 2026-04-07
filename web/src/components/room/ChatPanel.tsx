// ─── components/room/ChatPanel.tsx ──────────────────────────────────────────
// Real-time chat sidebar powered by Firestore.

'use client';
import { useState, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { type ChatMessage } from '@/lib/firestore';

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

  return (
    <aside className={`chat-panel${chatOpen ? ' open' : ''}`}>
      <div className="chat-header">
        <span>💬 Room Chat</span>
        <button className="icon-btn" onClick={toggleChat} aria-label="Close chat">✕</button>
      </div>

      <div className="chat-messages">
        <div className="chat-system">Chat messages are saved for this session</div>

        {messages.map(msg => {
          const isSelf = msg.senderUid === currentUid;
          return (
            <div key={msg.id} className={`chat-msg${isSelf ? ' self' : ''}`}>
              <span className="chat-from">{isSelf ? 'You' : msg.senderName}</span>
              {/* React auto-escapes textContent — no XSS risk */}
              <span className="chat-text">{msg.text}</span>
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
