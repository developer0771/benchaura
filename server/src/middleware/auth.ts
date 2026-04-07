// server/src/middleware/auth.ts
// Verifies Firebase ID tokens on socket connection.
//
// HOW IT WORKS:
//   Client sends Firebase ID token in socket handshake auth:
//     socket = io(URL, { auth: { token: await user.getIdToken() } })
//   Server verifies the token with Firebase Admin SDK.
//   If valid, attaches uid + email to socket.data for use in handlers.
//
// WHY THIS MATTERS:
//   Without this, anyone can claim any uid in the join-room payload.
//   With this, the uid is cryptographically verified by Firebase.

import * as admin from 'firebase-admin';
import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

declare module 'socket.io' {
  interface SocketData {
    uid: string;
    email: string;
    verified: boolean;
  }
}

export async function verifyFirebaseToken(
  socket: Socket,
  next: (err?: Error) => void
) {
  const token = socket.handshake.auth?.token as string | undefined;

  // If Firebase Admin isn't initialized (local dev without credentials), skip
  try {
    admin.app();
  } catch {
    socket.data = { uid: socket.id, email: 'dev@local', verified: false };
    return next();
  }

  if (!token) {
    logger.warn({ socketId: socket.id }, 'Socket connection rejected — no auth token');
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    socket.data = {
      uid: decoded.uid,
      email: decoded.email || '',
      verified: true,
    };
    next();
  } catch (err) {
    logger.warn({ socketId: socket.id, err }, 'Invalid Firebase token');
    next(new Error('Invalid authentication token'));
  }
}
