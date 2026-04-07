// ─── store/useAuthStore.ts ───────────────────────────────────────────────────
// Global authentication and user profile state.
//
// WHY ZUSTAND OVER CONTEXT + USESTATE:
//   React Context re-renders every consumer when ANY piece of state changes.
//   Zustand uses subscriptions — a component that reads only `student.name`
//   only re-renders when `student.name` changes, nothing else.
//   This matters in a video room where state changes every second.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from 'firebase/auth';

// The profile we store — trimmed from the Firebase User object
export interface StudentProfile {
  uid: string;
  name: string;
  email: string;
  course: string;
  isHost: boolean;
  currentRoomCode: string | null;
}

interface AuthState {
  // Firebase Auth user object (NOT persisted — re-hydrated on page load)
  firebaseUser: User | null;
  // Our app-level student profile (persisted in localStorage)
  student: StudentProfile | null;
  // True while Firebase is checking auth state on first load
  isAuthLoading: boolean;

  // Actions
  setFirebaseUser: (user: User | null) => void;
  setStudent: (student: StudentProfile | null) => void;
  updateStudent: (partial: Partial<StudentProfile>) => void;
  setAuthLoading: (loading: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      firebaseUser: null,
      student: null,
      isAuthLoading: true,

      setFirebaseUser: (firebaseUser) => set({ firebaseUser }),

      setStudent: (student) => set({ student }),

      updateStudent: (partial) => {
        const current = get().student;
        if (!current) return;
        set({ student: { ...current, ...partial } });
      },

      setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),

      clearSession: () => set({ firebaseUser: null, student: null }),
    }),
    {
      name: 'benchaura-auth', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // IMPORTANT: Only persist the student profile, not the Firebase User object
      // (Firebase User has circular references and can't be serialized)
      partialize: (state) => ({ student: state.student }),
    }
  )
);
