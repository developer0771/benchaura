// ─── store/useRoomStore.ts ───────────────────────────────────────────────────
// All state related to the active video room.
// This store is NOT persisted — it's ephemeral for the duration of a session.

import { create } from 'zustand';

export interface RemotePeer {
  socketId: string;
  uid: string;
  name: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
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
  updatePeerStream: (socketId: string, stream: MediaStream) => void;
  updatePeerMediaState: (socketId: string, isMuted: boolean, isCameraOff: boolean) => void;
  toggleChat: () => void;
  openChat: () => void;
  incrementUnread: () => void;
  clearUnread: () => void;

  setLocalHandRaised: (raised: boolean) => void;
  setPeerHand: (socketId: string, name: string, raised: boolean) => void;

  pushReaction: (r: Reaction) => void;
  expireReaction: (id: string) => void;

  setTimer: (t: TimerState) => void;

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
  chatOpen: false,
  unreadCount: 0,
  raisedHands: new Map<string, { name: string; at: number }>(),
  localHandRaised: false,
  reactions: [] as Reaction[],
  timer: idleTimer,
};

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

  updatePeerStream: (socketId, stream) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, stream });
      return { peers };
    }),

  updatePeerMediaState: (socketId, isMuted, isCameraOff) =>
    set((s) => {
      const peers = new Map(s.peers);
      const peer = peers.get(socketId);
      if (peer) peers.set(socketId, { ...peer, isMuted, isCameraOff });
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

  reset: () =>
    set({
      ...initialState,
      peers: new Map(),
      raisedHands: new Map(),
      reactions: [],
      timer: idleTimer,
      startTime: Date.now(),
    }),
}));
