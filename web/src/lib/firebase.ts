// ─── lib/firebase.ts ─────────────────────────────────────────────────────────
// Firebase SDK initialization.
//
// WHY THE getApps() CHECK:
//   Next.js uses hot-module replacement in dev mode. Without this guard,
//   every file save re-initializes Firebase, causing "duplicate app" errors.
//   The pattern "getApps().length ? getApps()[0] : initializeApp(config)"
//   ensures we always use the first (and only) instance.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize once, reuse everywhere
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
