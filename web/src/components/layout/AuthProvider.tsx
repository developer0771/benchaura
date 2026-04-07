// ─── components/layout/AuthProvider.tsx ─────────────────────────────────────
// Client component that starts the auth listener.
// Must be 'use client' because it uses a hook with useEffect.
// The layout.tsx (server component) renders this, which then renders children.

'use client';
import { useAuthListener } from '@/hooks/useAuthListener';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuthListener();
  return <>{children}</>;
}
