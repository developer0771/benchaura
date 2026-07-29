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
    let serviceAccount: Record<string, unknown>;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (err) {
      logger.error(
        { err },
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. ' +
        'Paste the entire service-account JSON file contents (starts with {"type":"service_account",...}) as the env var value.'
      );
      return;
    }

    // Validate the shape before handing it to the SDK — the SDK's own error
    // ("Service account object must contain a string 'project_id' property")
    // is too generic for diagnosing a misconfigured env var.
    const required = ['type', 'project_id', 'private_key', 'client_email'] as const;
    const missing = required.filter(k => typeof serviceAccount[k] !== 'string');
    if (missing.length > 0) {
      logger.error(
        { missing, keysSeen: Object.keys(serviceAccount) },
        'FIREBASE_SERVICE_ACCOUNT is missing required fields. ' +
        'Expected the SERVER service-account JSON (download from ' +
        'Firebase Console → Project settings → Service accounts → Generate new private key), ' +
        'NOT the client-side firebaseConfig (that one uses camelCase "projectId" and has no private_key). ' +
        `Missing: ${missing.join(', ')}.`
      );
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID ?? (serviceAccount.project_id as string),
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
