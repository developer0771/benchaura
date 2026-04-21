// ─── store/useRoomStore.ts ───────────────────────────────────────────────────
// All state related to the active video room.
// This store is NOT persisted — it's ephemeral for the duration of a session.
//
// MEDIA MODEL (post-LiveKit migration):
//   Peers are keyed by LiveKit participant identity (Firebase UID).
//   Each peer holds nullable references to their published video + audio
//   tracks; VideoCard calls `track.attach(el)` / `track.detach()` directly.
//   The old "socketId + MediaStream" shape is kept as a back-compat alias
//   (`socketId` now mirrors `identity`) so host-control signaling events
//   that travel over our Socket.io server can still address peers.

import { create } from 'zustand';
import type {
  RemoteVideoTrack, RemoteAudioTrack,
  ConnectionQuality,
} from 'livekit-client';

export interface RemotePeer {
  // Identity — LiveKit participant identity = Firebase UID. We keep `socketId`
  // as an alias (same value) because downstream components and the host-control
  // socket events reference peers by this key.
  identity: string;
  socketId: string;
  uid: string;
  name: string;
  videoTrack: RemoteVideoTrack | null;
  audioTrack: RemoteAudioTrack | null;
  screenTrack: RemoteVideoTrack | null;
  isMuted: boolean;        // audio muted
  isCameraOff: boolean;    // video disabled
  isSpeaking: boolean;
  connectionQuality: ConnectionQuality | 'unknown';
}

// A reaction floats up from a tile and auto-expires after ~4s.
export interface Reaction {
  id: string;
  socketId: string;  // who sent it
  name: string;
  emoji: string;
  at: number;        // timestamp for cleanup
}

// Pomodoro timer state — mirrored from Firestore so all clients stay in sync.
export type TimerPhase  = 'idle' | 'focus' | 'break';
export type TimerAction = 'start' | 'pause' | 'reset';
export interface TimerState {
  phase:     TimerPhase;
  action:    TimerAction;
  duration:  number;    // seconds of current phase
  startedAt: number;    // ms since epoch when the run started (or paused-at snapshot)
  remaining: number;    // seconds remaining when paused
}

// Layout: 'auto' switches grid → speaker once a room has more participants
// than the grid can comfortably render. 'grid' and 'speaker' override.
export type LayoutMode = 'auto' | 'grid' | 'speaker';
// Webinar mode: only host (and future co-hosts) can publish; everyone else
// is audience-only. Default 'meeting' = everyone publishes.
export type RoomMode = 'meeting' | 'webinar';

interface RoomState {
  // Room metadata
  roomCode: string;
  startTime: number;

  // Local user media state
  localMuted: boolean;
  localCameraOff: boolean;
  isSharingScreen: boolean;

  // Remote peers
  peers: Map<string, RemotePeer>;

  // Layout / focus
  layoutMode: LayoutMode;
  pinnedIdentity: string | null;
  // FIFO of recent speakers (most-recent first), capped to 8 entries.
  // Drives the speaker stage and thumbnail strip.
  lastSpeakers: string[];

  // Webinar mode (host-controlled, mirrored from room doc)
  roomMode: RoomMode;

  // Chat
  chatOpen: boolean;
  unreadCount: number;

  // Raise hand — socketId → { name, at }
  raisedHands: Map<string, { name: string; at: number }>;
  localHandRaised: boolean;

  // Floating emoji reactions (transient)
  reactions: Reaction[];

  // Shared Pomodoro timer
  timer: TimerState;

  // Actions
  setRoomCode: (code: string) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  setSharing: (sharing: boolean) => void;
  addPeer: (peer: RemotePeer) => void;
  removePeer: (socketId: string) => void;
  updatePeerTracks: (socketId: string, patch: Partial<Pick<RemotePeer,
    'videoTrack' | 'audioTrack' | 'screenTrack'>>) => void;
  updatePeerMediaState: (socketId: string, isMuted: boolean, isCameraOff: boolean) => void;
  updatePeerSpeaking: (socketId: string, isSpeaking: boolean) => void;
  updatePeerQuality: (socketId: string, quality: ConnectionQuality | 'unknown') => void;
  toggleChat: () => void;
  openChat: () => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  setLocalHandRaised: (raised: boolean) => void;
  setPeerHand: (socketId: string, name: string, raised: boolean) => void;

  pushReaction: (r: Reaction) => void;
  expireReaction: (id: string) => void;

  setTimer: (t: TimerState) => void;

  // Layout / focus actions
  setLayoutMode: (mode: LayoutMode) => void;
  pinIdentity: (id: string | null) => void;
  pushSpeakers: (identities: string[]) => void;

  // Webinar mode (sync from Firestore room doc)
  setRoomMode: (mode: RoomMode) => void;

  reset: () => void;
}

const idleTimer: TimerState = {
  phase: 'idle',
  action: 'reset',
  duration: 25 * 60,
  startedAt: 0,
  remaining: 25 * 60,
};

const initialState = {
  roomCode: '',
  startTime: Date.now(),
  localMuted: false,
  localCameraOff: false,
  isSharingScreen: false,
  peers: new Map<string, RemotePeer>(),
  layoutMode: 'auto' as LayoutMode,
  pinnedIdentity: null as string | null,
  lastSpeakers: [] as string[],
  roomMode: 'meeting' as RoomMode,
  chatOpen: false,
  unreadCount: 0,
  raisedHands: new Map<string, { name: string; at: number }>(),
  localHandRaised: false,
  reactions: [] as Reaction[],
  timer: idleTimer,
};

const SPEAKER_MEMORY = 8; // how many recent speakers we remember

export const useRoomStore = create<RoomState>()((set) => ({
  ...initialState,

  setRoomCode: (roomCode) => set({ roomCode }),

  toggleMute: () => set((s) => ({ localMuted: !s.localMuted })),

  toggleCamera: () => set((s) => ({ localCameraOff: !s.localCameraOff })),

  setSharing: (isSharingScreen) => set({ isSharingScreen }),

  addPeer: (peer) =>
    set((s) => {
      const peers = new Map(s.peers);
      peers.set(peer.socketId, peer);
      return { peers };
    }),

  removePeer: (socketId) =>
    set((s) => {
      const peers = new Map(s.peers);
      peers.delete(socketId);
      // Also drop any raised hand for this peer
      const raisedHands = new Map(s.raisedHands);
      raisedHands.delete(socketId);
      return { peers, raisedHands };
    }),

  updatePeerTracks: (socketId, patch) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, ...patch });
      return { peers };
    }),

  updatePeerMediaState: (socketId, isMuted, isCameraOff) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, isMuted, isCameraOff });
      return { peers };
    }),

  updatePeerSpeaking: (socketId, isSpeaking) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, isSpeaking });
      return { peers };
    }),

  updatePeerQuality: (socketId, connectionQuality) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, connectionQuality });
      return { peers };
    }),

  toggleChat: () =>
    set((s) => ({
      chatOpen: !s.chatOpen,
      unreadCount: !s.chatOpen ? 0 : s.unreadCount, // clear unread when opening
    })),

  openChat: () => set({ chatOpen: true, unreadCount: 0 }),

  incrementUnread: () =>
    set((s) => ({
      unreadCount: s.chatOpen ? 0 : s.unreadCount + 1,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  setLocalHandRaised: (localHandRaised) => set({ localHandRaised }),

  setPeerHand: (socketId, name, raised) =>
    set((s) => {
      const raisedHands = new Map(s.raisedHands);
      if (raised) raisedHands.set(socketId, { name, at: Date.now() });
      else raisedHands.delete(socketId);
      return { raisedHands };
    }),

  pushReaction: (r) =>
    set((s) => ({ reactions: [...s.reactions.slice(-9), r] })),

  expireReaction: (id) =>
    set((s) => ({ reactions: s.reactions.filter(r => r.id !== id) })),

  setTimer: (timer) => set({ timer }),

  // ── Layout / focus ────────────────────────────────────────────────────────
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  pinIdentity: (pinnedIdentity) => set({ pinnedIdentity }),
  pushSpeakers: (identities) =>
    set((s) => {
      if (identities.length === 0) return {};
      // Most recent speakers first; dedupe; preserve newer position over older.
      const merged = [...identities, ...s.lastSpeakers];
      const seen = new Set<string>();
      const dedup: string[] = [];
      for (const id of merged) {
        if (seen.has(id)) continue;
        seen.add(id);
        dedup.push(id);
        if (dedup.length >= SPEAKER_MEMORY) break;
      }
      // Bail if no actual change to avoid React re-render storms.
      if (dedup.length === s.lastSpeakers.length
          && dedup.every((id, i) => id === s.lastSpeakers[i])) {
        return {};
      }
      return { lastSpeakers: dedup };
    }),

  setRoomMode: (roomMode) => set({ roomMode }),

  reset: () =>
    set({
      ...initialState,
      peers: new Map(),
      raisedHands: new Map(),
      reactions: [],
      lastSpeakers: [],
      pinnedIdentity: null,
      timer: idleTimer,
      startTime: Date.now(),
    }),
}));
