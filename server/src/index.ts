// server/src/index.ts — Benchaura Signaling Server v2
// Production upgrades over v1:
//   ✅ Structured Pino logging (JSON in prod, pretty in dev)
//   ✅ Sentry error monitoring
//   ✅ Express + Socket.io rate limiting
//   ✅ Firebase token verification on socket connect
//   ✅ Firestore-backed room persistence
//   ✅ Dynamic TURN credentials endpoint (Twilio or free fallback)
//   ✅ Helmet security headers
//   ✅ Graceful shutdown (SIGTERM handler for Railway/Render)

import 'dotenv/config';
import * as Sentry from '@sentry/node';

// WebRTC types (browser-only, so we define them here for the server)
interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}
interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { logger } from './utils/logger';
import { initFirebase } from './services/firebase';
import { roomStore } from './services/roomStore';
import { getIceServers } from './services/turn';
import { generalLimiter, iceLimiter, withRateLimit, clearSocketLimits } from './middleware/rateLimit';
import { verifyFirebaseToken } from './middleware/auth';

// ── Sentry (error monitoring) ─────────────────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // capture 10% of transactions for performance
  });
  logger.info('Sentry initialized');
}

// ── Firebase ──────────────────────────────────────────────────────────────────
initFirebase();

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10kb' })); // prevent large payload attacks
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(generalLimiter);

// Sentry request handler must be first middleware
app.use(Sentry.expressErrorHandler());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// ── ICE servers endpoint ──────────────────────────────────────────────────────
// Client calls this on room mount to get fresh TURN credentials.
// Credentials are short-lived (1hr) and IP-bound — safe to expose per-request.
app.get('/ice-servers', iceLimiter, async (req, res) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';
    const servers = await getIceServers(clientIp);
    res.json({ iceServers: servers });
  } catch (err) {
    logger.error({ err }, 'Failed to get ICE servers');
    res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, credentials: true },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 1e5, // 100KB max message size
});

// Verify Firebase token on every new connection
io.use(verifyFirebaseToken);

io.on('connection', (socket) => {
  const { uid, email } = socket.data;
  logger.info({ socketId: socket.id, uid }, 'Socket connected');

  // ── JOIN ROOM ───────────────────────────────────────────────────────────────
  socket.on('join-room', withRateLimit(socket.id, 'join-room', async ({
    roomCode, name,
  }: { roomCode: string; name: string }) => {

    // Validate inputs
    if (!roomCode || !name || typeof roomCode !== 'string' || typeof name !== 'string') {
      socket.emit('error', { code: 'INVALID_PAYLOAD', message: 'Invalid join payload' });
      return;
    }
    if (!/^[A-Z]{2}\d-[A-Z0-9]{4}$/.test(roomCode)) {
      socket.emit('error', { code: 'INVALID_CODE', message: 'Invalid room code format' });
      return;
    }

    // Check room exists in Firestore
    const validation = await roomStore.validateRoom(roomCode);
    if (!validation.valid) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: validation.reason });
      return;
    }

    // Check room capacity
    if (roomStore.isRoomFull(roomCode)) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Room is full (max 8 participants)' });
      return;
    }

    // Join Socket.io room (logical grouping for broadcasts)
    socket.join(roomCode);

    // Get existing peers BEFORE adding this one
    const existingPeers = roomStore.getPeersExcept(roomCode, socket.id);

    // Register peer
    roomStore.ensureRoom(roomCode, uid);
    roomStore.addPeer(roomCode, {
      socketId: socket.id,
      uid,
      name: name.trim().slice(0, 50), // sanitize length
      joinedAt: Date.now(),
    });

    // Tell new peer about existing peers (they'll initiate offers to each)
    socket.emit('room-peers', existingPeers.map(p => ({
      socketId: p.socketId,
      uid: p.uid,
      name: p.name,
    })));

    // Tell existing peers about the new peer (they'll receive offers from them)
    socket.to(roomCode).emit('peer-joined', { socketId: socket.id, uid, name });

    logger.info({
      socketId: socket.id, roomCode, name, totalPeers: existingPeers.length + 1,
    }, 'Peer joined room');
  }));

  // ── WEBRTC SIGNALING ────────────────────────────────────────────────────────
  // Server is a dumb relay — validates room membership, then forwards.

  socket.on('webrtc-offer', withRateLimit(socket.id, 'webrtc-offer', ({
    to, offer,
  }: { to: string; offer: RTCSessionDescriptionInit }) => {
    const senderRoom   = roomStore.getRoomForSocket(socket.id);
    const recipientRoom = roomStore.getRoomForSocket(to);
    if (!senderRoom || senderRoom !== recipientRoom) return; // must be in same room

    socket.to(to).emit('webrtc-offer', { from: socket.id, offer });
  }));

  socket.on('webrtc-answer', withRateLimit(socket.id, 'webrtc-answer', ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    const senderRoom    = roomStore.getRoomForSocket(socket.id);
    const recipientRoom = roomStore.getRoomForSocket(to);
    if (!senderRoom || senderRoom !== recipientRoom) return;

    socket.to(to).emit('webrtc-answer', { from: socket.id, answer });
  }));

  socket.on('webrtc-ice', withRateLimit(socket.id, 'webrtc-ice', ({
    to, candidate,
  }: { to: string; candidate: RTCIceCandidateInit }) => {
    const senderRoom    = roomStore.getRoomForSocket(socket.id);
    const recipientRoom = roomStore.getRoomForSocket(to);
    if (!senderRoom || senderRoom !== recipientRoom) return;

    socket.to(to).emit('webrtc-ice', { from: socket.id, candidate });
  }));

  // ── MEDIA STATE ─────────────────────────────────────────────────────────────
  socket.on('media-state', withRateLimit(socket.id, 'media-state', ({
    isMuted, isCameraOff,
  }: { isMuted: boolean; isCameraOff: boolean }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;

    socket.to(roomCode).emit('peer-media-state', {
      socketId: socket.id, isMuted, isCameraOff,
    });
  }));

  // ── DISCONNECT ──────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    const result = roomStore.removePeer(socket.id);
    clearSocketLimits(socket.id);

    if (result) {
      io.to(result.roomCode).emit('peer-left', { socketId: socket.id });
      logger.info({
        socketId: socket.id, roomCode: result.roomCode,
        name: result.peer.name, reason, remaining: result.remaining,
      }, 'Peer disconnected');
    }
  });

  // ── ERROR ───────────────────────────────────────────────────────────────────
  socket.on('error', (err) => {
    logger.error({ socketId: socket.id, err }, 'Socket error');
    Sentry.captureException(err);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Railway sends SIGTERM before killing the container.
// We close the HTTP server (stop accepting new connections),
// then close Socket.io (notify clients), then exit.
function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown started');

  io.emit('server-shutdown', { message: 'Server is restarting. Please reconnect in a moment.' });

  httpServer.close(() => {
    logger.info('HTTP server closed');
    io.close(() => {
      logger.info('Socket.io closed');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Graceful shutdown timeout — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
httpServer.listen(PORT, () => {
  logger.info({ port: PORT, clientUrl: CLIENT_URL, env: process.env.NODE_ENV }, '🚀 Benchaura Signaling Server started');
});

export { app, io };
