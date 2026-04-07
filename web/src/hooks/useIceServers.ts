// web/src/hooks/useIceServers.ts
// Fetches fresh TURN credentials from the signaling server before each call.
// Falls back to Google STUN if the server is unreachable.
//
// WHY FETCH INSTEAD OF HARDCODE:
//   Twilio TURN credentials expire after 1 hour and are IP-bound.
//   They must be generated server-side for security.
//   Hardcoding them in the client bundle exposes them to anyone who reads your JS.

'use client';
import { useState, useEffect } from 'react';

const FALLBACK_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useIceServers() {
  const [iceServers, setIceServers] = useState<RTCIceServer[]>(FALLBACK_ICE);
  const [isLoading, setIsLoading]   = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetch_() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SOCKET_URL}/ice-servers`,
          { signal: controller.signal, credentials: 'include' }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setIceServers(data.iceServers ?? FALLBACK_ICE);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[ICE] Failed to fetch TURN credentials — using STUN only:', err);
        setIceServers(FALLBACK_ICE);
      } finally {
        setIsLoading(false);
      }
    }

    fetch_();
    return () => controller.abort();
  }, []);

  return { iceServers, isLoading };
}
