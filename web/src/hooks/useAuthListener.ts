// ─── hooks/useAuthListener.ts ────────────────────────────────────────────────
// Listens to Firebase Auth state changes and syncs them to Zustand.
//
// WHY THIS IS IN A HOOK, NOT A PROVIDER:
//   A Context Provider wraps your whole app and re-renders everything when
//   auth state changes. A hook at the layout level does the same job with
//   zero additional overhead.
//
// HOW TO USE:
//   Call this ONCE in your root layout: `useAuthListener()`
//   Then anywhere else: `const { student } = useAuthStore()`

'use client';
import { useEffect } from 'react';
import { onAuthStateChanged, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { getUserProfile } from '@/lib/firestore';

export function useAuthListener() {
  const { setFirebaseUser, setStudent, setAuthLoading } = useAuthStore();

  useEffect(() => {
    // ── Handle email link sign-in callback ─────────────────────────────────
    // When the user clicks the magic link in their email, Firebase redirects
    // them back to our app. This code detects and completes that flow.
    const handleEmailLinkSignIn = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = localStorage.getItem('benchaura_signin_email');
        if (!email) {
          // Fallback: ask user to re-enter email (opened link in different browser)
          email = window.prompt('Please enter your email to confirm sign-in:');
        }
        if (!email) return;

        try {
          await signInWithEmailLink(auth, email, window.location.href);
          localStorage.removeItem('benchaura_signin_email');
          // Clean up the URL so it doesn't look messy
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          console.error('[Auth] Email link sign-in failed:', err);
        }
      }
    };

    handleEmailLinkSignIn();

    // ── Subscribe to Firebase Auth state ──────────────────────────────────
    // This fires immediately with the current state, then again on every change.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (user) {
        // User is signed in — try to load their Firestore profile
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setStudent({
            uid: user.uid,
            name: profile.name,
            email: profile.email,
            course: profile.course,
            isHost: false, // set per-room, not globally
            currentRoomCode: null,
          });
        }
      } else {
        // User signed out
        setFirebaseUser(null);
      }

      setAuthLoading(false);
    });

    return unsubscribe;
  }, [setFirebaseUser, setStudent, setAuthLoading]);
}
