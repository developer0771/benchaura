// ─── hooks/useMedia.ts ──────────────────────────────────────────────────────
// Manages local camera and microphone streams.
//
// WHY SEPARATE FROM useWebRTC:
//   The local stream is needed for the local video preview regardless of WebRTC.
//   Separating concerns makes each hook independently testable and reusable.

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export type MediaPermission = 'pending' | 'granted' | 'denied' | 'skipped';

interface UseMediaReturn {
  localStream: MediaStream | null;
  permission: MediaPermission;
  isMuted: boolean;
  isCameraOff: boolean;
  requestCamera: () => Promise<void>;
  requestAudioOnly: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  replaceVideoTrack: (newTrack: MediaStreamTrack) => void;
  stopAll: () => void;
}

export function useMedia(): UseMediaReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MediaPermission>('pending');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  // Keep a ref so callbacks always see the latest stream without stale closures
  const streamRef = useRef<MediaStream | null>(null);

  // ── Request camera + mic ────────────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setPermission('granted');
    } catch (err) {
      console.error('[Media] Camera access denied:', err);
      setPermission('denied');
      // Fall back to audio only
      await requestAudioOnly();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Request mic only ────────────────────────────────────────────────────
  const requestAudioOnly = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setLocalStream(stream);
      setPermission('skipped');
    } catch (err) {
      console.error('[Media] Audio access denied:', err);
      setPermission('denied');
      // Create a silent empty stream so WebRTC doesn't break
      const emptyStream = new MediaStream();
      streamRef.current = emptyStream;
      setLocalStream(emptyStream);
    }
  }, []);

  // ── Toggle mute ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    const newMuted = !isMuted;
    audioTracks.forEach(track => {
      track.enabled = !newMuted; // enabled=false mutes without stopping the track
    });
    setIsMuted(newMuted);
  }, [isMuted]);

  // ── Toggle camera ───────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const newCameraOff = !isCameraOff;
    videoTracks.forEach(track => {
      track.enabled = !newCameraOff;
    });
    setIsCameraOff(newCameraOff);
  }, [isCameraOff]);

  // ── Replace video track (used when switching to screen share and back) ──
  const replaceVideoTrack = useCallback((newTrack: MediaStreamTrack) => {
    const stream = streamRef.current;
    if (!stream) return;
    const oldVideoTracks = stream.getVideoTracks();
    oldVideoTracks.forEach(track => {
      stream.removeTrack(track);
      track.stop();
    });
    stream.addTrack(newTrack);
    setLocalStream(new MediaStream([...stream.getTracks()])); // trigger re-render
  }, []);

  // ── Stop all tracks ─────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setLocalStream(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return {
    localStream,
    permission,
    isMuted,
    isCameraOff,
    requestCamera,
    requestAudioOnly,
    toggleMute,
    toggleCamera,
    replaceVideoTrack,
    stopAll,
  };
}
