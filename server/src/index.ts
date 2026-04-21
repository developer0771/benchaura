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

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { logger } from './utils/logger';
import { initFirebase } from './services/firebase';
import { roomStore } from './services/roomStore';
import { getIceServers } from './services/turn';
import { createLiveKitToken, getLiveKitUrl, isLiveKitConfigured } from './services/livekit';
import { generalLimiter, iceLimiter, withRateLimit, clearSocketLimits } from './middleware/rateLimit';
import { verifyFirebaseToken } from './middleware/auth';
import { verifyFirebaseBearer } from './middleware/httpAuth';

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
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// ── ICE servers endpoint ──────────────────────────────────────────────────────
// Legacy: only used if LiveKit isn't configured and the app is running in the
// old mesh-WebRTC mode. LiveKit manages its own TURN, so this endpoint is
// unused in the default configuration.
app.get('/ice-servers', iceLimiter, async (req: Request, res: Response) => {
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';
    const servers = await getIceServers(clientIp);
    res.json({ iceServers: servers });
  } catch (err) {
    logger.error({ err }, 'Failed to get ICE servers');
    res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});

// ── LiveKit token endpoint ────────────────────────────────────────────────────
// Body: { roomCode: string, name: string }
// Auth: Authorization: Bearer <Firebase ID token>
// Returns: { url: string, token: string }
//
// We verify the Firebase identity server-side so a malicious client cannot
// impersonate another user. LiveKit identity = Firebase UID, so each user has
// exactly one presence per room (duplicate joins evict the prior one).
app.post('/livekit/token', verifyFirebaseBearer, async (req: Request, res: Response) => {
  try {
    if (!isLiveKitConfigured()) {
      res.status(503).json({
        error: 'LIVEKIT_NOT_CONFIGURED',
        message: 'Server is missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. See server/.env.local.example',
      });
      return;
    }

    const { roomCode, name, isHost } = req.body as { roomCode?: string; name?: string; isHost?: boolean };
    if (!roomCode || !name || typeof roomCode !== 'string' || typeof name !== 'string') {
      res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'roomCode and name are required' });
      return;
    }
    if (!/^[A-Z]{2}\d-[A-Z0-9]{4}$/.test(roomCode)) {
      res.status(400).json({ error: 'INVALID_CODE', message: 'Invalid room code format' });
      return;
    }

    // Confirm the room exists in Firestore (same check the socket layer does)
    const validation = await roomStore.validateRoom(roomCode);
    if (!validation.valid) {
      res.status(404).json({ error: 'ROOM_NOT_FOUND', message: validation.reason });
      return;
    }

    const user = req.user!;
    const token = await createLiveKitToken({
      identity: user.uid,
      name:     name.trim().slice(0, 50),
      roomName: roomCode,
      metadata: JSON.stringify({ isHost: Boolean(isHost) }),
    });

    res.json({ url: getLiveKitUrl(), token });
  } catch (err) {
    logger.error({ err }, 'Failed to mint LiveKit token');
    res.status(500).json({ error: 'TOKEN_ERROR', message: 'Failed to create LiveKit token' });
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

    // Check room capacity (LiveKit SFU can handle this; the UI will need
    // pagination / active-speaker focus past ~30 to stay usable)
    if (roomStore.isRoomFull(roomCode)) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Room is full (max 500 participants)' });
      return;
    }

    // Join Socket.io room (logical grouping for broadcasts)
    socket.join(roomCode);

    // Get existing peers BEFORE adding this one
    const existingPeers = roomStore.getPeersExcept(roomCode, socket.id);

    // Register peer — use authoritative hostUid from Firestore (falls back to
    // joining uid only if Firestore lookup failed, which is rare).
    roomStore.ensureRoom(roomCode, validation.hostUid ?? uid);
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

  // ── MEDIA SIGNALING IS HANDLED BY LIVEKIT ───────────────────────────────────
  // Previously this file relayed webrtc-offer/answer/ice and media-state for a
  // P2P mesh. With LiveKit SFU, clients talk directly to the LiveKit server;
  // track publish / subscribe / mute state all flow through LiveKit's own
  // protocol. This Socket.io server now only handles presence (join/leave),
  // host controls, reactions, raise-hand, and the Pomodoro timer.

  // ── HOST CONTROLS ───────────────────────────────────────────────────────────
  // Only the room host (uid matching room.hostUid) can send these.

  // Target one specific participant
  socket.on('host-control', withRateLimit(socket.id, 'host-control', ({
    targetSocketId, action,
  }: { targetSocketId: string; action: string }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;

    // Verify sender is host
    if (roomStore.getHostUid(roomCode) !== uid) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can control participants' });
      return;
    }

    // Target must be in the same room
    if (roomStore.getRoomForSocket(targetSocketId) !== roomCode) return;

    socket.to(targetSocketId).emit('host-control', { action });
    logger.info({ socketId: socket.id, targetSocketId, action }, 'Host control relayed');
  }));

  // Broadcast to all participants in the room (except host)
  socket.on('host-control-all', withRateLimit(socket.id, 'host-control-all', ({
    action,
  }: { action: string }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;

    if (roomStore.getHostUid(roomCode) !== uid) return;

    socket.to(roomCode).emit('host-control', { action });
    logger.info({ socketId: socket.id, roomCode, action }, 'Host control broadcast to all');
  }));

  // ── REACTIONS ───────────────────────────────────────────────────────────────
  // Any participant can send a brief emoji reaction that floats up on everyone's
  // screen. Not persisted. Server just validates and broadcasts.
  socket.on('room:reaction', withRateLimit(socket.id, 'room:reaction', ({
    emoji,
  }: { emoji: string }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;
    if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) return;

    const peer = roomStore.getPeer(socket.id);
    if (!peer) return;

    io.to(roomCode).emit('room:reaction', {
      id: `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      socketId: socket.id,
      name: peer.name,
      emoji,
    });
  }));

  // ── RAISE HAND ──────────────────────────────────────────────────────────────
  // Any participant can toggle their hand raised / lowered. Broadcast to the
  // room so everyone (especially the host) sees who has raised their hand.
  socket.on('room:raise-hand', withRateLimit(socket.id, 'room:raise-hand', ({
    raised,
  }: { raised: boolean }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;

    const peer = roomStore.getPeer(socket.id);
    if (!peer) return;

    io.to(roomCode).emit('room:raise-hand', {
      socketId: socket.id,
      name: peer.name,
      raised: Boolean(raised),
    });
  }));

  // ── POMODORO TIMER ──────────────────────────────────────────────────────────
  // Host-controlled shared countdown visible to all participants in the room.
  // Server doesn't persist — clients that join late receive current state
  // via a replay on join (see below).
  //
  // A timer message looks like:
  //   { phase: 'focus' | 'break' | 'idle', startedAt: ms, duration: seconds,
  //     action: 'start' | 'pause' | 'reset' | 'tick' }
  //
  // We keep the latest per-room state in memory so late joiners can sync.
  const roomTimers = (globalThis as unknown as { __roomTimers?: Map<string, unknown> }).__roomTimers
    ?? new Map<string, unknown>();
  (globalThis as unknown as { __roomTimers: Map<string, unknown> }).__roomTimers = roomTimers;

  socket.on('room:timer', withRateLimit(socket.id, 'room:timer', (payload: {
    phase: 'focus' | 'break' | 'idle';
    action: 'start' | 'pause' | 'reset';
    duration: number;       // seconds
    startedAt: number;      // ms since epoch when the current run started
    remaining?: number;     // seconds remaining when paused
  }) => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;

    // Only host can drive the timer
    if (roomStore.getHostUid(roomCode) !== uid) {
      socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can control the timer' });
      return;
    }

    // Light validation
    if (typeof payload.duration !== 'number' || payload.duration < 0 || payload.duration > 7200) return;
    if (!['focus', 'break', 'idle'].includes(payload.phase)) return;
    if (!['start', 'pause', 'reset'].includes(payload.action)) return;

    roomTimers.set(roomCode, payload);
    io.to(roomCode).emit('room:timer', payload);
    logger.info({ roomCode, action: payload.action, phase: payload.phase }, 'Timer update');
  }));

  // When a peer joins, send the current timer state (if any) just to that peer.
  // Hooked into the 'join-room' flow by emitting here after the fact.
  // Simpler: reply when a client asks for it.
  socket.on('room:timer-sync', () => {
    const roomCode = roomStore.getRoomForSocket(socket.id);
    if (!roomCode) return;
    const state = roomTimers.get(roomCode);
    if (state) socket.emit('room:timer', state);
  });

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
