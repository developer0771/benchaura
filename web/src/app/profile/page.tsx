// ─── app/profile/page.tsx ─────────────────────────────────────────────────────
// User profile page — now backed by Firestore, not localStorage.

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile, type UserProfile } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { getInitials } from '@/lib/utils';

export default function ProfilePage() {
  const router = useRouter();
  const { student, clearSession, firebaseUser } = useAuthStore();
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load Firestore profile (richer than cached student object)
  useEffect(() => {
    if (!student?.uid) {
      setIsLoading(false);
      return;
    }
    getUserProfile(student.uid)
      .then(p => { setProfile(p); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [student?.uid]);

  async function handleSignOut() {
    if (!confirm('Sign out of Benchaura?')) return;
    await signOut(auth);
    clearSession();
    router.push('/');
  }

  if (isLoading) {
    return (
      <div className="page-profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative' }}>
        <div className="bg-orbs"><div className="bg-orb orb-1" /></div>
        <div className="noise-overlay" />
        <p style={{ color: 'var(--text-muted)', position: 'relative', zIndex: 1 }}>Loading profile…</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="page-profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative' }}>
        <div className="bg-orbs"><div className="bg-orb orb-1" /></div>
        <div className="noise-overlay" />
        <div className="profile-card" style={{ textAlign: 'center', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>No session found.</p>
          <Link href="/join" className="btn btn-primary btn-full">Join a Room</Link>
        </div>
      </div>
    );
  }

  const initials = getInitials(student.name);
  const displayProfile = profile || { ...student, roomHistory: [] };

  return (
    <div className="page-profile">
      <div className="bg-orbs"><div className="bg-orb orb-1" /></div>
      <div className="noise-overlay" />

      <header className="navbar">
        <Link href="/" className="nav-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">Benchaura</span>
        </Link>
        <nav className="nav-links">
          {student.currentRoomCode && (
            <Link href={`/room/${student.currentRoomCode}`} className="btn btn-sm">
              Back to Room
            </Link>
          )}
        </nav>
      </header>

      <main className="profile-main">
        <div className="profile-card">
          {/* Avatar */}
          <div className="profile-avatar">{initials}</div>
          <h1 className="profile-name">{student.name}</h1>
          <p className="profile-course">{student.course}</p>

          {/* Details */}
          <div className="profile-details">
            {[
              { icon: '📧', label: 'Email',      value: student.email },
              { icon: '🏫', label: 'Course',     value: student.course },
              { icon: '🔑', label: 'Current Room', value: student.currentRoomCode || '—' },
              { icon: '👑', label: 'Role',       value: student.isHost ? '🎓 Room Host' : '👤 Participant' },
              { icon: '✅', label: 'Auth Status', value: firebaseUser ? '🟢 Signed in' : '🔴 Not verified' },
            ].map(({ icon, label, value }) => (
              <div key={label} className="detail-row">
                <span className="detail-icon">{icon}</span>
                <div>
                  <span className="detail-label">{label}</span>
                  <span className="detail-value">{value}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Room history */}
          {displayProfile.roomHistory && displayProfile.roomHistory.length > 0 && (
            <div className="room-history">
              <h3>Recent Rooms</h3>
              <div className="history-chips">
                {displayProfile.roomHistory.map(code => (
                  <Link key={code} href={`/room/${code}`} className="history-chip">{code}</Link>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="profile-actions">
            {student.currentRoomCode && (
              <Link href={`/room/${student.currentRoomCode}`} className="btn btn-primary">
                Rejoin Room
              </Link>
            )}
            <Link href="/join" className="btn btn-ghost">New Room</Link>
            <button className="btn btn-danger" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
