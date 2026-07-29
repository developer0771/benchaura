'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/useAuthStore';
import { getUserProfile } from '@/lib/firestore';

export function useAuthListener() {
  const { setFirebaseUser, setStudent, setAuthLoading } = useAuthStore();

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setStudent(null);
        setAuthLoading(false);
        return;
      }

      const currentStudent = useAuthStore.getState().student;
      const sameUser = currentStudent?.uid === user.uid;
      if (!sameUser) setStudent(null);

      try {
        const profile = await getUserProfile(user.uid);
        if (!isMounted || auth.currentUser?.uid !== user.uid) return;

        if (!profile) {
          setStudent(null);
          return;
        }

        const latestStudent = useAuthStore.getState().student;
        const stillSameUser = latestStudent?.uid === user.uid;
        setStudent({
          uid: user.uid,
          name: profile.name,
          email: profile.email,
          course: profile.course,
          isHost: stillSameUser ? latestStudent.isHost : false,
          currentRoomCode: stillSameUser ? latestStudent.currentRoomCode : null,
        });
      } catch (error) {
        console.error('[Auth] Failed to load user profile:', error);
        if (isMounted && auth.currentUser?.uid === user.uid) setStudent(null);
      } finally {
        if (isMounted && auth.currentUser?.uid === user.uid) setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [setFirebaseUser, setStudent, setAuthLoading]);
}
