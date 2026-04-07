// ─── lib/firestore.ts ────────────────────────────────────────────────────────
// All Firestore operations in one place.
//
// DATABASE SCHEMA:
//
//  rooms/{roomCode}                       ← Room document
//    code:         string                 e.g. "CS4-AB2X"
//    hostUid:      string                 Firebase UID of creator
//    hostName:     string
//    course:       string
//    isActive:     boolean
//    createdAt:    Timestamp
//    participants: Participant[]          Array updated on join/leave
//
//  rooms/{roomCode}/messages/{msgId}      ← Chat message subcollection
//    senderUid:  string
//    senderName: string
//    text:       string
//    createdAt:  Timestamp
//
//  users/{uid}                            ← User profile document
//    uid:        string
//    name:       string
//    email:      string
//    course:     string
//    createdAt:  Timestamp
//    roomHistory: string[]               last 10 room codes

import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  DocumentSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Participant {
  uid: string;
  name: string;
  joinedAt: Timestamp | null;
}

export interface Room {
  code: string;
  hostUid: string;
  hostName: string;
  course: string;
  isActive: boolean;
  createdAt: Timestamp | null;
  participants: Participant[];
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  course: string;
  createdAt: Timestamp | null;
  roomHistory: string[];
}

// ─── Room Operations ──────────────────────────────────────────────────────────

/**
 * Create a new room. Called when the host submits the "Create Room" form.
 * Uses setDoc with merge:false so a duplicate room code is an error,
 * not a silent overwrite.
 */
export async function createRoom(
  roomCode: string,
  host: { uid: string; name: string; course: string }
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const existing = await getDoc(roomRef);

  // If a room with this code already exists and is active, reject
  if (existing.exists() && existing.data().isActive) {
    throw new Error(`Room ${roomCode} already exists. Refresh to get a new code.`);
  }

  await setDoc(roomRef, {
    code: roomCode,
    hostUid: host.uid,
    hostName: host.name,
    course: host.course,
    isActive: true,
    createdAt: serverTimestamp(),
    participants: [
      { uid: host.uid, name: host.name, joinedAt: new Date() },
    ],
  });
}

/**
 * Join an existing room. Validates the room exists and is active.
 * Uses arrayUnion so concurrent joins don't overwrite each other.
 */
export async function joinRoom(
  roomCode: string,
  participant: { uid: string; name: string }
): Promise<Room> {
  const roomRef = doc(db, 'rooms', roomCode.toUpperCase());
  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    throw new Error(`Room "${roomCode}" not found. Check the code and try again.`);
  }

  const room = snap.data() as Room;
  if (!room.isActive) {
    throw new Error('This room has ended.');
  }

  // Add participant (arrayUnion is idempotent by object equality in Firestore)
  await updateDoc(roomRef, {
    participants: arrayUnion({
      uid: participant.uid,
      name: participant.name,
      joinedAt: new Date(),
    }),
  });

  return room;
}

/**
 * Leave a room. Removes participant from the array.
 * If the host leaves, marks the room as inactive.
 */
export async function leaveRoom(
  roomCode: string,
  uid: string,
  isHost: boolean
): Promise<void> {
  const roomRef = doc(db, 'rooms', roomCode);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;

  const room = snap.data() as Room;
  const updatedParticipants = room.participants.filter(p => p.uid !== uid);

  if (isHost) {
    await updateDoc(roomRef, { isActive: false, participants: updatedParticipants });
  } else {
    await updateDoc(roomRef, { participants: updatedParticipants });
  }
}

/**
 * Subscribe to room document changes (participant list, active status).
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToRoom(
  roomCode: string,
  callback: (room: Room | null) => void
): () => void {
  return onSnapshot(doc(db, 'rooms', roomCode), (snap: DocumentSnapshot) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(snap.data() as Room);
  });
}

// ─── Chat Operations ──────────────────────────────────────────────────────────

/**
 * Send a chat message. Firestore will broadcast to all subscribers instantly.
 */
export async function sendMessage(
  roomCode: string,
  sender: { uid: string; name: string },
  text: string
): Promise<void> {
  if (!text.trim()) return;
  await addDoc(collection(db, 'rooms', roomCode, 'messages'), {
    senderUid: sender.uid,
    senderName: sender.name,
    text: text.trim().slice(0, 500), // server-side length limit
    createdAt: serverTimestamp(),
  });
}

/**
 * Subscribe to chat messages in real-time.
 * Fetches last 100 messages ordered by time.
 */
export function subscribeToMessages(
  roomCode: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const q = query(
    collection(db, 'rooms', roomCode, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );

  return onSnapshot(q, (snap) => {
    const messages: ChatMessage[] = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<ChatMessage, 'id'>),
    }));
    callback(messages);
  });
}

// ─── User Profile Operations ──────────────────────────────────────────────────

/**
 * Create or update a user profile document.
 * Called after successful authentication.
 */
export async function upsertUserProfile(
  uid: string,
  profile: { name: string; email: string; course: string }
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);

  if (!existing.exists()) {
    await setDoc(userRef, {
      uid,
      ...profile,
      createdAt: serverTimestamp(),
      roomHistory: [],
    });
  } else {
    // Update name/course but preserve history
    await updateDoc(userRef, {
      name: profile.name,
      course: profile.course,
    });
  }
}

/**
 * Add a room code to user's history (keep last 10).
 */
export async function addToRoomHistory(uid: string, roomCode: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;

  const current: string[] = snap.data().roomHistory || [];
  const updated = [roomCode, ...current.filter(c => c !== roomCode)].slice(0, 10);
  await updateDoc(userRef, { roomHistory: updated });
}

/**
 * Get user profile.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}
