// server/src/middleware/httpAuth.ts
// Express middleware that verifies a Firebase ID token on the Authorization
// header (`Bearer <token>`). Mirrors the socket auth pattern in ./auth.ts
// but for REST endpoints (e.g. POST /livekit/token).

import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { uid: string; email: string; verified: boolean };
  }
}

export async function verifyFirebaseBearer(
  req: Request, res: Response, next: NextFunction
): Promise<void> {
  // If Firebase Admin isn't initialized (local dev without creds), mark as
  // unverified so the route can decide whether to continue.
  try {
    admin.app();
  } catch {
    req.user = { uid: `dev-${Math.random().toString(36).slice(2, 10)}`, email: 'dev@local', verified: false };
    next();
    return;
  }

  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    req.user = { uid: decoded.uid, email: decoded.email || '', verified: true };
    next();
  } catch (err) {
    logger.warn({ err }, 'Invalid Firebase token on HTTP request');
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}
