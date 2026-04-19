// server/src/middleware/rateLimit.ts
// Two layers of rate limiting:
//   1. HTTP rate limiting via express-rate-limit (for REST endpoints)
//   2. Socket.io event rate limiting (custom, per-socket)
//
// Why both?
//   HTTP limiter protects /ice-servers and /health endpoints.
//   Socket limiter prevents spam events (join-room flood, message spam).

import rateLimit from 'express-rate-limit';
import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

// ── HTTP rate limiters ────────────────────────────────────────────────────────

// General API: 100 requests per minute per IP
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  handler: (req, res, next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json(options.message);
  },
});

// ICE server endpoint: 20 requests per minute per IP (more expensive)
export const iceLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many ICE server requests.' },
});

// ── Socket.io event rate limiter ─────────────────────────────────────────────

interface EventCount {
  count: number;
  resetAt: number;
}

const socketEventCounts = new Map<string, Map<string, EventCount>>();

const EVENT_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'join-room':      { max: 5,   windowMs: 60_000 },   // 5 joins per minute
  'webrtc-offer':   { max: 30,  windowMs: 60_000 },   // 30 offers per minute
  'webrtc-answer':  { max: 30,  windowMs: 60_000 },   // 30 answers per minute
  'webrtc-ice':     { max: 200, windowMs: 60_000 },   // 200 ICE candidates per minute
  'media-state':    { max: 60,  windowMs: 60_000 },   // 60 state changes per minute
  'room:reaction':  { max: 40,  windowMs: 60_000 },   // 40 reactions per minute
  'room:raise-hand':{ max: 20,  windowMs: 60_000 },   // 20 raise/lower per minute
  'room:timer':     { max: 20,  windowMs: 60_000 },   // 20 timer commands per minute (host only)
};

export function isSocketRateLimited(socketId: string, event: string): boolean {
  const limit = EVENT_LIMITS[event];
  if (!limit) return false;

  const now = Date.now();

  if (!socketEventCounts.has(socketId)) {
    socketEventCounts.set(socketId, new Map());
  }
  const counts = socketEventCounts.get(socketId)!;

  const current = counts.get(event);
  if (!current || now > current.resetAt) {
    counts.set(event, { count: 1, resetAt: now + limit.windowMs });
    return false;
  }

  if (current.count >= limit.max) {
    logger.warn({ socketId, event, count: current.count }, 'Socket event rate limit exceeded');
    return true;
  }

  current.count++;
  return false;
}

// Clean up counters when socket disconnects
export function clearSocketLimits(socketId: string) {
  socketEventCounts.delete(socketId);
}

// ── Socket.io middleware factory ──────────────────────────────────────────────
// Wraps a socket handler to automatically check rate limits before executing
export function withRateLimit(
  socketId: string,
  event: string,
  handler: (...args: any[]) => void
) {
  return (...args: any[]) => {
    if (isSocketRateLimited(socketId, event)) {
      // Emit error back to the specific socket (not broadcast)
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        callback({ error: 'Rate limit exceeded. Please slow down.' });
      }
      return;
    }
    handler(...args);
  };
}
