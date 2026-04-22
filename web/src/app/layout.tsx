// ─── app/layout.tsx ──────────────────────────────────────────────────────────
// Root layout — wraps every page.
// This is where global fonts, styles, and the auth listener live.

import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/layout/AuthProvider';

export const metadata: Metadata = {
  title: 'Benchaura — Study Together, Grow Together',
  description: 'Real-time video collaboration for students. Create a room, invite your class, and learn side by side.',
  openGraph: {
    title: 'Benchaura',
    description: 'Real-time video collaboration for students.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500..800;1,9..144,500..700&family=JetBrains+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* AuthProvider starts the Firebase auth listener once at the root */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
