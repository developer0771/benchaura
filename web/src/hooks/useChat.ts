// ─── hooks/useChat.ts ────────────────────────────────────────────────────────
// Real-time chat backed by Firestore.
// Every message goes to the database → Firestore pushes to ALL subscribers.
// This replaces the old DOM-only chat that nobody else could see.

'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessage, subscribeToMessages, type ChatMessage } from '@/lib/firestore';
import { useRoomStore } from '@/store/useRoomStore';

interface UseChatProps {
  roomCode: string;
  uid: string;
  name: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  isSending: boolean;
}

export function useChat({ roomCode, uid, name }: UseChatProps): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const { chatOpen, incrementUnread } = useRoomStore();

  // Track the previous message count to detect new messages
  const prevCountRef = useRef(0);

  // ── Subscribe to Firestore messages in real-time ─────────────────────────
  useEffect(() => {
    if (!roomCode) return;

    const unsubscribe = subscribeToMessages(roomCode, (newMessages) => {
      setMessages(newMessages);

      // If there are new messages and chat is closed, increment badge
      if (newMessages.length > prevCountRef.current) {
        const newestMsg = newMessages[newMessages.length - 1];
        // Only notify for OTHER people's messages, not our own
        if (newestMsg?.senderUid !== uid) {
          incrementUnread();
        }
      }
      prevCountRef.current = newMessages.length;
    });

    // Cleanup: unsubscribe from Firestore when leaving the room
    // Without this, you'd have dangling listeners causing memory leaks and
    // "can't update state on unmounted component" errors
    return unsubscribe;
  }, [roomCode, uid, incrementUnread]);

  // ── Send a message ───────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(roomCode, { uid, name }, text);
    } catch (err) {
      console.error('[Chat] Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  }, [roomCode, uid, name, isSending]);

  return { messages, send, isSending };
}
