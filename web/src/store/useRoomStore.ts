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
  reset: () => void;
}

const initialState = {
  roomCode: '',
  startTime: Date.now(),
  localMuted: false,
  localCameraOff: false,
  isSharingScreen: false,
  peers: new Map<string, RemotePeer>(),
  chatOpen: false,
  unreadCount: 0,
};

export const useRoomStore = create<RoomState>()((set, get) => ({
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
      return { peers };
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

  reset: () => set({ ...initialState, peers: new Map(), startTime: Date.now() }),
}));
