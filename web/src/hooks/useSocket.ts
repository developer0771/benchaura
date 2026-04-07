// web/src/hooks/useSocket.ts — v2
// KEY CHANGE FROM v1:
//   Sends Firebase ID token in socket handshake auth so the server
//   can verify the user's identity. Without this, anyone can claim any uid.
//
// Token refresh:
//   Firebase ID tokens expire after 1 hour. We call getIdToken(true)
//   on reconnect to always send a fresh token.

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { auth } from '@/lib/firebase';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export interface SocketError {
  code: string;
  message: string;
}

export function useSocket() {
  const socketRef    = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketError, setSocketError] = useState<SocketError | null>(null);

  // Get current Firebase ID token (refreshes automatically if expired)
  const getToken = useCallback(async (): Promise<string | undefined> => {
    try {
      return await auth.currentUser?.getIdToken();
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let socket: Socket;

    const connect = async () => {
      const token = await getToken();

      socket = io(SOCKET_URL, {
        // Send Firebase token so the server can verify identity
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10_000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        setIsConnected(true);
        setSocketError(null);
      });

      socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        setIsConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('[Socket] Connection error:', err.message);
        setSocketError({ code: 'CONNECTION_ERROR', message: err.message });
        setIsConnected(false);
      });

      // Server-sent error events (rate limit, room full, invalid code, etc.)
      socket.on('error', (err: SocketError) => {
        console.error('[Socket] Server error:', err);
        setSocketError(err);
      });

      // Server is restarting — notify user gracefully
      socket.on('server-shutdown', ({ message }: { message: string }) => {
        setSocketError({ code: 'SERVER_SHUTDOWN', message });
      });

      // On reconnect, refresh the token in case it expired
      socket.on('reconnect_attempt', async () => {
        const freshToken = await getToken();
        if (freshToken && socket.auth) {
          (socket.auth as Record<string, string>).token = freshToken;
        }
      });

      socket.on('reconnect', () => {
        setSocketError(null);
        setIsConnected(true);
      });
    };

    connect();

    return () => {
      console.log('[Socket] Cleaning up');
      socket?.disconnect();
      socketRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearError = useCallback(() => setSocketError(null), []);

  return {
    socket: socketRef.current,
    isConnected,
    socketError,
    clearError,
  };
}
