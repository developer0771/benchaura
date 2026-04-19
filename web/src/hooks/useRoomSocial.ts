// ─── hooks/useRoomSocial.ts ──────────────────────────────────────────────────
// Wires the "social" socket events (reactions, raise-hand, pomodoro timer)
// into the room Zustand store and exposes simple emit helpers.
//
// Called once from the room page.

'use client';
import { useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { useRoomStore, type Reaction, type TimerState } from '@/store/useRoomStore';

interface UseRoomSocialProps {
  socket: Socket | null;
  /** How long each reaction stays on screen, in ms. */
  reactionTtl?: number;
}

interface UseRoomSocialReturn {
  sendReaction:   (emoji: string) => void;
  toggleHand:     () => void;
  setTimerState:  (payload: TimerState) => void;   // host only — server enforces
  requestTimerSync: () => void;
}

export function useRoomSocial({ socket, reactionTtl = 4000 }: UseRoomSocialProps): UseRoomSocialReturn {
  const {
    pushReaction, expireReaction, setPeerHand, setTimer,
    localHandRaised, setLocalHandRaised,
  } = useRoomStore();

  // ── Incoming: reactions ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onReaction = (r: Reaction) => {
      pushReaction({ ...r, at: Date.now() });
      window.setTimeout(() => expireReaction(r.id), reactionTtl);
    };

    socket.on('room:reaction', onReaction);
    return () => { socket.off('room:reaction', onReaction); };
  }, [socket, pushReaction, expireReaction, reactionTtl]);

  // ── Incoming: raise-hand ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onHand = ({ socketId, name, raised }: { socketId: string; name: string; raised: boolean }) => {
      // Self-state is tracked via localHandRaised; the server still broadcasts
      // to us, which we use to keep the two in lockstep in case of a retry.
      if (socketId === socket.id) {
        setLocalHandRaised(raised);
      }
      setPeerHand(socketId, name, raised);
    };

    socket.on('room:raise-hand', onHand);
    return () => { socket.off('room:raise-hand', onHand); };
  }, [socket, setPeerHand, setLocalHandRaised]);

  // ── Incoming: pomodoro timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onTimer = (t: TimerState) => setTimer(t);
    socket.on('room:timer', onTimer);

    // Ask server for current timer state on mount (for late joiners)
    socket.emit('room:timer-sync');

    return () => { socket.off('room:timer', onTimer); };
  }, [socket, setTimer]);

  // ── Outgoing helpers ───────────────────────────────────────────────────────
  const sendReaction = useCallback((emoji: string) => {
    if (!socket) return;
    socket.emit('room:reaction', { emoji });
  }, [socket]);

  const toggleHand = useCallback(() => {
    if (!socket) return;
    const next = !localHandRaised;
    setLocalHandRaised(next);
    socket.emit('room:raise-hand', { raised: next });
  }, [socket, localHandRaised, setLocalHandRaised]);

  const setTimerState = useCallback((payload: TimerState) => {
    if (!socket) return;
    socket.emit('room:timer', payload);
  }, [socket]);

  const requestTimerSync = useCallback(() => {
    if (!socket) return;
    socket.emit('room:timer-sync');
  }, [socket]);

  return { sendReaction, toggleHand, setTimerState, requestTimerSync };
}
