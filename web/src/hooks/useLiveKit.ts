// ─── hooks/useLiveKit.ts ─────────────────────────────────────────────────────
// Single integration point with LiveKit SFU. Replaces useMedia + useWebRTC
// + useIceServers from the mesh-WebRTC era.
//
// RESPONSIBILITIES:
//   • Fetch a short-lived LiveKit access token from our signaling server
//   • Connect to the LiveKit room and publish camera + microphone
//   • Subscribe to remote participant tracks and hydrate the zustand store
//   • Expose local media controls (mute/unmute, camera on/off, screen share)
//   • Surface connection state + errors for the UI to render
//
// WHY KEEP OUR OWN SOCKET.IO SERVER:
//   LiveKit handles media only. We still need presence, host controls,
//   reactions, raise-hand, and Pomodoro — all of which continue to flow
//   over Socket.io exactly as before.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room, RoomEvent, Track,
  LocalVideoTrack, LocalAudioTrack,
  RemoteParticipant, RemoteTrack, RemoteTrackPublication,
  RemoteVideoTrack, RemoteAudioTrack,
  LocalParticipant, Participant,
  ConnectionState, ConnectionQuality,
  DisconnectReason,
  createLocalVideoTrack, createLocalAudioTrack, createLocalScreenTracks,
} from 'livekit-client';
import { auth } from '@/lib/firebase';
import { useRoomStore, type RemotePeer } from '@/store/useRoomStore';

export type MediaPermission = 'pending' | 'granted' | 'denied' | 'skipped';

interface UseLiveKitProps {
  roomCode: string;
  displayName: string;
  isHost: boolean;
  /** When true the hook will attempt to connect. Defaults to true once
   *  Firebase auth is ready; the caller can gate on permissions etc. */
  enabled: boolean;
}

interface UseLiveKitReturn {
  room: Room | null;
  connectionState: ConnectionState;
  connectionQuality: ConnectionQuality | 'unknown';
  isConnected: boolean;
  error: string | null;

  // Local media
  localVideoTrack: LocalVideoTrack | null;
  localAudioTrack: LocalAudioTrack | null;
  localScreenTrack: LocalVideoTrack | null;
  permission: MediaPermission;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;

  // Actions
  requestCamera: () => Promise<void>;
  requestAudioOnly: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

// Peer shape helper — we key by LiveKit identity (Firebase UID).
function makePeer(p: Participant): RemotePeer {
  return {
    identity:   p.identity,
    socketId:   p.identity,          // alias for host-control event API
    uid:        p.identity,
    name:       p.name || p.identity,
    videoTrack: null,
    audioTrack: null,
    screenTrack: null,
    isMuted:    !p.isMicrophoneEnabled,
    isCameraOff: !p.isCameraEnabled,
    isSpeaking: p.isSpeaking,
    connectionQuality: 'unknown',
  };
}

export function useLiveKit({
  roomCode, displayName, isHost, enabled,
}: UseLiveKitProps): UseLiveKitReturn {
  const roomRef = useRef<Room | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);

  const [permission, setPermission] = useState<MediaPermission>('pending');
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [localScreenTrack, setLocalScreenTrack] = useState<LocalVideoTrack | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);

  const {
    addPeer, removePeer, updatePeerTracks, updatePeerMediaState,
    updatePeerSpeaking, updatePeerQuality, pushSpeakers,
  } = useRoomStore();

  // ── Token fetch ────────────────────────────────────────────────────────────
  const fetchToken = useCallback(async (): Promise<{ url: string; token: string }> => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    const idToken = await user.getIdToken();

    const res = await fetch(`${SIGNALING_URL}/livekit/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ roomCode, name: displayName, isHost }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Token request failed (${res.status})`);
    }
    return res.json();
  }, [roomCode, displayName, isHost]);

  // ── Permissions / local track creation ─────────────────────────────────────
  const requestCamera = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([
        createLocalVideoTrack({
          resolution: { width: 1280, height: 720 },
          facingMode: 'user',
        }),
        createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }),
      ]);
      setLocalVideoTrack(v);
      setLocalAudioTrack(a);
      setPermission('granted');
    } catch (err) {
      console.error('[LiveKit] Camera request failed:', err);
      setPermission('denied');
      // Fall back to audio-only
      await requestAudioOnly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestAudioOnly = useCallback(async () => {
    try {
      const a = await createLocalAudioTrack({
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      });
      setLocalAudioTrack(a);
      setLocalVideoTrack(null);
      setPermission('skipped');
    } catch (err) {
      console.error('[LiveKit] Audio request failed:', err);
      setPermission('denied');
    }
  }, []);

  // ── Connect once we have permission + a Firebase user ──────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (permission !== 'granted' && permission !== 'skipped') return;
    if (roomRef.current) return; // already connected / connecting

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,          // auto-adjust quality to viewport size
      dynacast: true,                // drop layers no one subscribes to
      publishDefaults: {
        simulcast: true,             // publish low/mid/high — SFU picks layer
      },
    });
    roomRef.current = room;

    // ── Room-level events ────────────────────────────────────────────────────
    const onConnStateChange = (s: ConnectionState) => setConnectionState(s);
    const onDisconnected = (reason?: DisconnectReason) => {
      if (reason !== undefined) {
        console.warn('[LiveKit] Disconnected:', reason);
      }
    };
    const onLocalQuality = (q: ConnectionQuality, participant: Participant) => {
      if (participant === room.localParticipant) {
        setConnectionQuality(q);
      } else {
        updatePeerQuality(participant.identity, q);
      }
    };

    room.on(RoomEvent.ConnectionStateChanged, onConnStateChange);
    room.on(RoomEvent.Disconnected,            onDisconnected);
    room.on(RoomEvent.ConnectionQualityChanged, onLocalQuality);

    // ── Remote participant tracking ──────────────────────────────────────────
    const onParticipantConnected = (p: RemoteParticipant) => {
      addPeer(makePeer(p));
      // Backfill already-published tracks
      p.trackPublications.forEach(pub => {
        if (pub.track) handleTrackSubscribed(pub.track as RemoteTrack, pub, p);
      });
    };
    const onParticipantDisconnected = (p: RemoteParticipant) => {
      removePeer(p.identity);
    };

    const handleTrackSubscribed = (
      track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Video) {
        if (pub.source === Track.Source.ScreenShare) {
          updatePeerTracks(p.identity, { screenTrack: track as RemoteVideoTrack });
        } else {
          updatePeerTracks(p.identity, { videoTrack: track as RemoteVideoTrack });
          updatePeerMediaState(p.identity, !p.isMicrophoneEnabled, !p.isCameraEnabled);
        }
      } else if (track.kind === Track.Kind.Audio) {
        updatePeerTracks(p.identity, { audioTrack: track as RemoteAudioTrack });
        updatePeerMediaState(p.identity, !p.isMicrophoneEnabled, !p.isCameraEnabled);
      }
    };
    const onTrackSubscribed = handleTrackSubscribed;

    const onTrackUnsubscribed = (
      track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Video) {
        if (pub.source === Track.Source.ScreenShare) {
          updatePeerTracks(p.identity, { screenTrack: null });
        } else {
          updatePeerTracks(p.identity, { videoTrack: null });
        }
      } else if (track.kind === Track.Kind.Audio) {
        updatePeerTracks(p.identity, { audioTrack: null });
      }
    };

    const onTrackMuted = (_pub: unknown, p: Participant) => {
      if (p === room.localParticipant) return;
      updatePeerMediaState(p.identity, !p.isMicrophoneEnabled, !p.isCameraEnabled);
    };
    const onTrackUnmuted = onTrackMuted;

    const onSpeakersChanged = (speakers: Participant[]) => {
      const speakingIds = new Set(speakers.map(s => s.identity));
      room.remoteParticipants.forEach(p => {
        updatePeerSpeaking(p.identity, speakingIds.has(p.identity));
      });
    };

    room.on(RoomEvent.ParticipantConnected,    onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed,         onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed,       onTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted,              onTrackMuted);
    room.on(RoomEvent.TrackUnmuted,            onTrackUnmuted);
    room.on(RoomEvent.ActiveSpeakersChanged,   onSpeakersChanged);

    // ── Connect ──────────────────────────────────────────────────────────────
    (async () => {
      try {
        const { url, token } = await fetchToken();
        if (cancelled) return;

        await room.connect(url, token);
        if (cancelled) { await room.disconnect(); return; }

        // Publish whatever local tracks we already created
        if (localAudioTrack) await room.localParticipant.publishTrack(localAudioTrack);
        if (localVideoTrack) await room.localParticipant.publishTrack(localVideoTrack);

        // Backfill peers already present before we joined
        room.remoteParticipants.forEach(p => onParticipantConnected(p as RemoteParticipant));
      } catch (err) {
        console.error('[LiveKit] Connect failed:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    })();

    return () => {
      cancelled = true;
      room.off(RoomEvent.ConnectionStateChanged, onConnStateChange);
      room.off(RoomEvent.Disconnected,            onDisconnected);
      room.off(RoomEvent.ConnectionQualityChanged, onLocalQuality);
      room.off(RoomEvent.ParticipantConnected,    onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.TrackSubscribed,         onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed,       onTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted,              onTrackMuted);
      room.off(RoomEvent.TrackUnmuted,            onTrackUnmuted);
      room.off(RoomEvent.ActiveSpeakersChanged,   onSpeakersChanged);
      room.disconnect().catch(() => {});
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, permission, fetchToken]);

  // Publish local tracks if they arrive AFTER the room is already connected
  // (shouldn't normally happen, but handles edge-case re-permission flows).
  useEffect(() => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const lp = room.localParticipant;

    if (localAudioTrack && !lp.getTrackPublication(Track.Source.Microphone)) {
      lp.publishTrack(localAudioTrack).catch(console.error);
    }
    if (localVideoTrack && !lp.getTrackPublication(Track.Source.Camera)) {
      lp.publishTrack(localVideoTrack).catch(console.error);
    }
  }, [localAudioTrack, localVideoTrack]);

  // ── Local controls ─────────────────────────────────────────────────────────
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    const next = !isMuted;
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(!next);
    } else if (localAudioTrack) {
      // Not connected yet — flip track enabled state so preview reflects it
      await (next ? localAudioTrack.mute() : localAudioTrack.unmute());
    }
    setIsMuted(next);
  }, [isMuted, localAudioTrack]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    const next = !isCameraOff;
    if (room) {
      await room.localParticipant.setCameraEnabled(!next);
    } else if (localVideoTrack) {
      await (next ? localVideoTrack.mute() : localVideoTrack.unmute());
    }
    setIsCameraOff(next);
  }, [isCameraOff, localVideoTrack]);

  const startScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || isSharingScreen) return;
    try {
      const tracks = await createLocalScreenTracks({ audio: false });
      const videoTrack = tracks.find(t => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
      if (!videoTrack) return;
      await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare });
      setLocalScreenTrack(videoTrack);
      setIsSharingScreen(true);

      // Browser "Stop sharing" button — the track fires 'ended'
      videoTrack.mediaStreamTrack.addEventListener('ended', () => {
        void stopScreenShare();
      });
    } catch (err) {
      console.warn('[LiveKit] Screen share cancelled / failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSharingScreen]);

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !localScreenTrack) {
      setIsSharingScreen(false);
      setLocalScreenTrack(null);
      return;
    }
    try {
      await room.localParticipant.unpublishTrack(localScreenTrack);
      localScreenTrack.stop();
    } finally {
      setLocalScreenTrack(null);
      setIsSharingScreen(false);
    }
  }, [localScreenTrack]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    if (room) await room.disconnect();
    localVideoTrack?.stop();
    localAudioTrack?.stop();
    localScreenTrack?.stop();
    setLocalVideoTrack(null);
    setLocalAudioTrack(null);
    setLocalScreenTrack(null);
  }, [localVideoTrack, localAudioTrack, localScreenTrack]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Effect cleanup above handles room.disconnect; also stop local tracks
      localVideoTrack?.stop();
      localAudioTrack?.stop();
      localScreenTrack?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isConnected = connectionState === ConnectionState.Connected;

  return {
    room: roomRef.current,
    connectionState,
    connectionQuality,
    isConnected,
    error,
    localVideoTrack,
    localAudioTrack,
    localScreenTrack,
    permission,
    isMuted,
    isCameraOff,
    isSharingScreen,
    requestCamera,
    requestAudioOnly,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    disconnect,
  };
}

// Re-export for consumers
export { ConnectionQuality, ConnectionState };
export type { LocalVideoTrack, LocalAudioTrack, RemoteVideoTrack, RemoteAudioTrack };

// Unused imports (kept so tree-shaking doesn't drop symbols we may need later)
void LocalParticipant;
