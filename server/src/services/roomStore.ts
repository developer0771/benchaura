// server/src/services/roomStore.ts
// Two-layer room storage:
//   Layer 1 — In-memory Map (fast, per-instance, for active socket routing)
//   Layer 2 — Firestore (persistent, survives restarts, shared across instances)
//
// WHY BOTH:
//   Socket routing (who is in which room) must be fast — O(1) in memory.
//   Room metadata (hostUid, createdAt, participant list) must survive crashes.
//   Firestore writes are async and non-blocking for the critical path.

import { getFirestore } from './firebase';
import { logger, roomLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface Peer {
  socketId: string;
  uid: string;
  name: string;
  joinedAt: number;
}

export interface RoomState {
  code: string;
  hostUid: string;
  peers: Map<string, Peer>;  // socketId → Peer
  createdAt: number;
  isActive: boolean;
}

class RoomStore {
  // In-memory: active room state for socket routing
  private rooms = new Map<string, RoomState>();
  // Reverse index: socketId → roomCode (for fast disconnect lookup)
  private socketToRoom = new Map<string, string>();

  // ── Write room to Firestore (non-blocking) ───────────────────────────────
  private async persistRoom(roomCode: string) {
    const db = getFirestore();
    if (!db) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    try {
      await db.collection('rooms').doc(roomCode).set({
        code: room.code,
        hostUid: room.hostUid,
        isActive: room.isActive,
        peerCount: room.peers.size,
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (err) {
      logger.error({ err, roomCode }, 'Failed to persist room to Firestore');
    }
  }

  // ── Validate room exists in Firestore before joining ────────────────────
  async validateRoom(roomCode: string): Promise<{ valid: boolean; reason?: string }> {
    const db = getFirestore();
    if (!db) return { valid: true }; // skip validation if no DB

    try {
      const snap = await db.collection('rooms').doc(roomCode).get();
      if (!snap.exists) return { valid: false, reason: 'Room not found' };
      const data = snap.data()!;
      if (!data.isActive) return { valid: false, reason: 'Room has ended' };
      return { valid: true };
    } catch (err) {
      logger.error({ err, roomCode }, 'Firestore validation failed — allowing join');
      return { valid: true }; // fail open (don't block users on DB error)
    }
  }

  // ── Create or get room ───────────────────────────────────────────────────
  ensureRoom(roomCode: string, hostUid: string): RoomState {
    if (!this.rooms.has(roomCode)) {
      const room: RoomState = {
        code: roomCode,
        hostUid,
        peers: new Map(),
        createdAt: Date.now(),
        isActive: true,
      };
      this.rooms.set(roomCode, room);
      roomLogger(roomCode).info({ hostUid }, 'Room created');
    }
    return this.rooms.get(roomCode)!;
  }

  // ── Add peer ─────────────────────────────────────────────────────────────
  addPeer(roomCode: string, peer: Peer): Peer[] {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error(`Room ${roomCode} not found`);

    room.peers.set(peer.socketId, peer);
    this.socketToRoom.set(peer.socketId, roomCode);

    roomLogger(roomCode).info(
      { socketId: peer.socketId, name: peer.name, peerCount: room.peers.size },
      'Peer joined'
    );

    this.persistRoom(roomCode); // async, non-blocking
    return [...room.peers.values()];
  }

  // ── Remove peer ──────────────────────────────────────────────────────────
  removePeer(socketId: string): { roomCode: string; peer: Peer; remaining: number } | null {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return null;

    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const peer = room.peers.get(socketId);
    if (!peer) return null;

    room.peers.delete(socketId);
    this.socketToRoom.delete(socketId);

    const remaining = room.peers.size;
    roomLogger(roomCode).info({ socketId, name: peer.name, remaining }, 'Peer left');

    if (remaining === 0) {
      // Mark room inactive in Firestore after grace period
      setTimeout(async () => {
        if (this.rooms.get(roomCode)?.peers.size === 0) {
          this.rooms.delete(roomCode);
          const db = getFirestore();
          if (db) {
            await db.collection('rooms').doc(roomCode)
              .update({ isActive: false, endedAt: Date.now() })
              .catch(() => {});
          }
          roomLogger(roomCode).info('Room cleaned up');
        }
      }, 30_000);
    } else {
      this.persistRoom(roomCode);
    }

    return { roomCode, peer, remaining };
  }

  getPeersExcept(roomCode: string, excludeSocketId: string): Peer[] {
    return [...(this.rooms.get(roomCode)?.peers.values() ?? [])]
      .filter(p => p.socketId !== excludeSocketId);
  }

  getRoomForSocket(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  getPeerCount(roomCode: string): number {
    return this.rooms.get(roomCode)?.peers.size ?? 0;
  }

  // ── Max peers guard ──────────────────────────────────────────────────────
  isRoomFull(roomCode: string, maxPeers = 8): boolean {
    return (this.rooms.get(roomCode)?.peers.size ?? 0) >= maxPeers;
  }

  // ── Host lookup ──────────────────────────────────────────────────────────
  getHostUid(roomCode: string): string | undefined {
    return this.rooms.get(roomCode)?.hostUid;
  }

  // ── Get a single peer by socketId ─────────────────────────────────────────
  getPeer(socketId: string): Peer | undefined {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode)?.peers.get(socketId);
  }
}

export const roomStore = new RoomStore();
