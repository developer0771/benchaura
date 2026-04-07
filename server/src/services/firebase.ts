// server/src/services/firebase.ts
// Firebase Admin SDK — server-side only.
// Uses a service account (never the client-side config).
// This lets the signaling server write room state to Firestore
// so it survives server restarts and scales across multiple instances.

import * as admin from 'firebase-admin';
import { logger } from '../utils/logger';

let initialized = false;

export function initFirebase() {
  if (initialized) return;

  // In production: set GOOGLE_APPLICATION_CREDENTIALS env var to path of
  // your service account JSON, OR set FIREBASE_SERVICE_ACCOUNT to the
  // JSON string directly (easier for Railway/Render env vars).
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Auto-detected from file path
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    // Local dev fallback — use emulator or skip persistence
    logger.warn('No Firebase credentials found — room state will be in-memory only');
    return;
  }

  initialized = true;
  logger.info('Firebase Admin initialized');
}

export function getFirestore() {
  if (!initialized) return null;
  return admin.firestore();
}
