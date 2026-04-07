// web/src/hooks/useReconnection.ts
// Handles graceful reconnection when a peer connection drops.
// Listens to RTCPeerConnection state changes and attempts ICE restart
// before giving up and showing a UI error.
//
// RECONNECTION STRATEGY:
//   1. connectionState → "disconnected": wait 5s (might self-heal)
//   2. Still disconnected: attempt ICE restart (re-negotiate network path)
//   3. connectionState → "failed": remove peer from UI, notify user

'use client';
import { useCallback, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { toast } from '@/components/ui/Toast';
import type { Socket } from 'socket.io-client';

export function useReconnection(socket: Socket | null) {
  const { removePeer } = useRoomStore();
  const reconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleConnectionStateChange = useCallback((
    pc: RTCPeerConnection,
    remoteSocketId: string,
    remoteName: string,
    initiator: boolean,
  ) => {
    const state = pc.connectionState;

    if (state === 'disconnected') {
      // Start a 5-second timer before attempting ICE restart
      const timer = setTimeout(() => {
        if (pc.connectionState !== 'disconnected') return;

        toast(`⚠️ ${remoteName}'s connection is unstable — reconnecting…`);

        if (initiator) {
          // ICE restart: create a new offer with iceRestart: true
          pc.createOffer({ iceRestart: true })
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
              socket?.emit('webrtc-offer', {
                to: remoteSocketId,
                offer: pc.localDescription,
              });
            })
            .catch(err => console.error('[Reconnect] ICE restart failed:', err));
        }
      }, 5000);

      reconnectTimers.current.set(remoteSocketId, timer);
    }

    if (state === 'connected') {
      // Clear any pending reconnect timer
      const timer = reconnectTimers.current.get(remoteSocketId);
      if (timer) {
        clearTimeout(timer);
        reconnectTimers.current.delete(remoteSocketId);
      }
    }

    if (state === 'failed') {
      const timer = reconnectTimers.current.get(remoteSocketId);
      if (timer) clearTimeout(timer);
      reconnectTimers.current.delete(remoteSocketId);

      // Remove from UI
      removePeer(remoteSocketId);
      toast(`❌ ${remoteName} disconnected`);
    }
  }, [socket, removePeer]);

  const clearReconnectTimer = useCallback((socketId: string) => {
    const timer = reconnectTimers.current.get(socketId);
    if (timer) clearTimeout(timer);
    reconnectTimers.current.delete(socketId);
  }, []);

  return { handleConnectionStateChange, clearReconnectTimer };
}
