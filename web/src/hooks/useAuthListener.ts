// ─── hooks/useAuthListener.ts ────────────────────────────────────────────────
// Listens to Firebase Auth state changes and syncs them to Zustand.

'use client';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { getUserProfile } from '@/lib/firestore';

export function useAuthListener() {
  const { setFirebaseUser, setStudent, setAuthLoading } = useAuthStore();

  useEffect(() => {
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
            isHost: false,
            currentRoomCode: null,
          });
        }
      } else {
        setFirebaseUser(null);
      }

      setAuthLoading(false);
    });

    return unsubscribe;
  }, [setFirebaseUser, setStudent, setAuthLoading]);
}
