// ─── app/join/page.tsx ────────────────────────────────────────────────────────
// Join / Create room page with Email + Password authentication.
// Supports both Login (existing user) and Register (new user) flows.
// Also supports join links: /join?room=XX0-ABCD

'use client';
import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createRoom, joinRoom, upsertUserProfile, addToRoomHistory } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { generateRoomCode, isValidRoomCode } from '@/lib/utils';

type RoomTab  = 'create' | 'join';
type AuthMode = 'login'  | 'register';

export default function JoinPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <JoinPageContent />
    </Suspense>
  );
}

function JoinPageContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const { setStudent, firebaseUser } = useAuthStore();

  const [tab,      setTab]      = useState<RoomTab>('create');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Form fields
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [course,    setCourse]    = useState('');
  const [roomCode,  setRoomCode]  = useState(() => generateRoomCode());
  const [joinCode,  setJoinCode]  = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [showPass,  setShowPass]  = useState(false);

  // ── Pre-fill join code from share link (?room=XX0-ABCD) ──────────────────
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setJoinCode(roomParam.toUpperCase());
      setTab('join');
    }
  }, [searchParams]);

  // ── If already signed in & has an active room, redirect ──────────────────
  useEffect(() => {
    if (firebaseUser) {
      const { student } = useAuthStore.getState();
      if (student?.currentRoomCode) {
        router.push(`/room/${student.currentRoomCode}`);
      }
    }
  }, [firebaseUser, router]);

  // ── Pre-fill name / email when already signed in ─────────────────────────
  useEffect(() => {
    if (firebaseUser) {
      if (!name)  setName(firebaseUser.displayName || '');
      if (!email) setEmail(firebaseUser.email || '');
    }
  }, [firebaseUser, name, email]);

  // ── Clear errors whenever auth mode changes ───────────────────────────────
  useEffect(() => { setErrors({}); }, [authMode]);

  // ── Validate ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!firebaseUser) {
      if (authMode === 'register' && !name.trim())
        e.name = 'Name is required';

      if (!email.trim())
        e.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        e.email = 'Enter a valid email';

      if (!password.trim())
        e.password = 'Password is required';
      else if (password.length < 6)
        e.password = 'Password must be at least 6 characters';
    } else {
      // already signed in — just need name
      if (!name.trim()) e.name = 'Name is required';
    }

    if (tab === 'create') {
      if (!course.trim()) e.course = 'Course is required';
    } else {
      if (!joinCode.trim()) e.joinCode = 'Room code is required';
      else if (!isValidRoomCode(joinCode)) e.joinCode = 'Invalid format (e.g. CS4-AB2X)';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Auth + Room Action ────────────────────────────────────────────────────
  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});

    try {
      let uid       = firebaseUser?.uid;
      let userEmail = firebaseUser?.email || email.trim();

      if (!uid) {
        const trimmedEmail = email.trim();

        if (authMode === 'login') {
          // ── LOGIN ─────────────────────────────────────────────────────────
          try {
            const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
            uid       = cred.user.uid;
            userEmail = cred.user.email || trimmedEmail;
            // Use display name from Firebase if user didn't type one
            if (!name.trim()) setName(cred.user.displayName || '');
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
              throw new Error("No account found. Switch to Register to create one.");
            if (code === 'auth/wrong-password')
              throw new Error('Incorrect password. Please try again.');
            if (code === 'auth/too-many-requests')
              throw new Error('Too many attempts. Please wait and try again.');
            throw err;
          }
        } else {
          // ── REGISTER ──────────────────────────────────────────────────────
          try {
            const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
            await updateProfile(cred.user, { displayName: name.trim() });
            uid       = cred.user.uid;
            userEmail = cred.user.email || trimmedEmail;
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === 'auth/email-already-in-use')
              throw new Error('Email already registered. Switch to Login instead.');
            if (code === 'auth/weak-password')
              throw new Error('Password is too weak. Use at least 6 characters.');
            throw err;
          }
        }
      }

      const userName  = (name.trim() || firebaseUser?.displayName || userEmail.split('@')[0]);
      const userCourse = course.trim() || 'Not specified';

      await upsertUserProfile(uid!, { name: userName, email: userEmail, course: userCourse });

      if (tab === 'create') {
        await createRoom(roomCode, { uid: uid!, name: userName, course: userCourse });
        await addToRoomHistory(uid!, roomCode);
        setStudent({ uid: uid!, name: userName, email: userEmail, course: userCourse, isHost: true, currentRoomCode: roomCode });
        router.push(`/room/${roomCode}`);
      } else {
        const code = joinCode.trim().toUpperCase();
        const room = await joinRoom(code, { uid: uid!, name: userName });
        await addToRoomHistory(uid!, code);
        setStudent({ uid: uid!, name: userName, email: userEmail, course: room.course, isHost: false, currentRoomCode: code });
        router.push(`/room/${code}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrors({ general: message });
    } finally {
      setIsLoading(false);
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await signOut(auth);
    setName(''); setEmail(''); setPassword(''); setCourse('');
  }

  const fromShareLink = Boolean(searchParams.get('room'));

  return (
    <div className="page-join">
      <div className="bg-orbs">
        <div className="bg-orb orb-1" />
        <div className="bg-orb orb-2" />
      </div>
      <div className="noise-overlay" />

      <header className="navbar">
        <Link href="/" className="nav-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">Benchaura</span>
        </Link>
      </header>

      <main className="join-main">
        <div className="join-card">
          <div className="join-header">
            <h1>{fromShareLink ? 'Join Room' : 'Welcome to Benchaura'}</h1>
            <p>
              {firebaseUser
                ? `Signed in as ${firebaseUser.displayName || firebaseUser.email}`
                : 'Sign in or create a free account to get started.'}
            </p>
          </div>

          {/* ── Auth mode toggle (only when not signed in) ─────────────── */}
          {!firebaseUser && (
            <div className="auth-mode-toggle">
              <button
                type="button"
                className={`auth-mode-btn${authMode === 'login' ? ' active' : ''}`}
                onClick={() => setAuthMode('login')}
              >
                🔑 Login
              </button>
              <button
                type="button"
                className={`auth-mode-btn${authMode === 'register' ? ' active' : ''}`}
                onClick={() => setAuthMode('register')}
              >
                ✨ Register
              </button>
            </div>
          )}

          {/* ── Room tabs (hide if coming from share link) ──────────────── */}
          {!fromShareLink && (
            <div className="tabs" style={{ marginTop: firebaseUser ? 0 : 12 }}>
              <button className={`tab${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>
                Create Room
              </button>
              <button className={`tab${tab === 'join' ? ' active' : ''}`} onClick={() => setTab('join')}>
                Join Room
              </button>
            </div>
          )}

          {/* ── Error banner ────────────────────────────────────────────── */}
          {errors.general && (
            <div style={{
              background: 'var(--red-dim)', border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 8, padding: '12px 16px', fontSize: 14,
              color: 'var(--red)', marginBottom: 16,
            }}>
              {errors.general}
            </div>
          )}

          {/* ── Already signed in banner ─────────────────────────────────── */}
          {firebaseUser && (
            <div style={{
              background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 8, padding: '10px 16px', fontSize: 14,
              color: 'var(--green)', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>✓ {firebaseUser.displayName || firebaseUser.email}</span>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  background: 'none', border: '1px solid rgba(16,185,129,0.4)',
                  borderRadius: 6, color: 'var(--green)', fontSize: 12,
                  padding: '3px 8px', cursor: 'pointer',
                }}
              >
                Switch account
              </button>
            </div>
          )}

          <form className="join-form" onSubmit={handleSubmit} noValidate>

            {/* ── Name (register mode or already signed in) ─────────────── */}
            {(authMode === 'register' || firebaseUser) && (
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input id="name" className={`form-input${errors.name ? ' error' : ''}`}
                  placeholder="e.g. Arjun Sharma"
                  value={name} onChange={e => setName(e.target.value)} />
                <span className="form-error">{errors.name}</span>
              </div>
            )}

            {/* ── Email + Password (only if not signed in) ──────────────── */}
            {!firebaseUser && (
              <>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email"
                    className={`form-input${errors.email ? ' error' : ''}`}
                    placeholder="e.g. arjun@college.edu"
                    value={email} onChange={e => setEmail(e.target.value)} />
                  <span className="form-error">{errors.email}</span>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="password"
                      type={showPass ? 'text' : 'password'}
                      className={`form-input${errors.password ? ' error' : ''}`}
                      placeholder={authMode === 'register' ? 'Min 6 characters' : 'Your password'}
                      style={{ paddingRight: 44 }}
                      value={password} onChange={e => setPassword(e.target.value)} />
                    <button
                      type="button"
                      onClick={() => setShowPass(p => !p)}
                      style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)', background: 'none',
                        border: 'none', cursor: 'pointer', fontSize: 16,
                        color: 'var(--text-dim)', padding: 0,
                      }}
                      title={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <span className="form-error">{errors.password}</span>
                  {authMode === 'login' && (
                    <p className="form-hint">Don&apos;t have an account?{' '}
                      <button type="button" onClick={() => setAuthMode('register')}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
                        Register here
                      </button>
                    </p>
                  )}
                  {authMode === 'register' && (
                    <p className="form-hint">Already have an account?{' '}
                      <button type="button" onClick={() => setAuthMode('login')}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
                        Login instead
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── Create-room fields ────────────────────────────────────── */}
            {tab === 'create' && (
              <>
                <div className="form-group">
                  <label htmlFor="course">Course / Subject</label>
                  <input id="course" className={`form-input${errors.course ? ' error' : ''}`}
                    placeholder="e.g. Computer Science — Sem 4"
                    value={course} onChange={e => setCourse(e.target.value)} />
                  <span className="form-error">{errors.course}</span>
                </div>
                <div className="form-group room-code-group">
                  <label>Your Room Code</label>
                  <div className="room-code-display">
                    <span className="code-text">{roomCode}</span>
                    <button type="button" className="refresh-btn" title="Generate new code"
                      onClick={() => setRoomCode(generateRoomCode())}>↻</button>
                  </div>
                  <p className="form-hint">Share this code with your classmates.</p>
                </div>
              </>
            )}

            {/* ── Join-room fields ──────────────────────────────────────── */}
            {tab === 'join' && (
              <div className="form-group">
                <label htmlFor="joinCode">Room Code</label>
                <input id="joinCode"
                  className={`form-input${errors.joinCode ? ' error' : ''}`}
                  placeholder="e.g. CS4-8X2Y"
                  maxLength={8}
                  style={{ textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'monospace', fontSize: 18 }}
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())} />
                <span className="form-error">{errors.joinCode}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-full" disabled={isLoading}>
              {isLoading ? (
                <><div className="btn-spinner" /> Please wait…</>
              ) : firebaseUser ? (
                tab === 'create' ? '🚀 Create Room' : '🚀 Join Room'
              ) : authMode === 'login' ? (
                tab === 'create' ? '🔑 Login & Create Room' : '🔑 Login & Join Room'
              ) : (
                tab === 'create' ? '✨ Register & Create Room' : '✨ Register & Join Room'
              )}
            </button>
          </form>
        </div>

        {/* ── Side info panel ─────────────────────────────────────────────── */}
        <div className="join-info">
          <h3>What you get</h3>
          <ul className="info-list">
            <li><span className="info-icon">🎥</span> HD video for up to 8 participants</li>
            <li><span className="info-icon">💬</span> Real-time group chat</li>
            <li><span className="info-icon">🖥️</span> Screen sharing</li>
            <li><span className="info-icon">🔐</span> Private room with unique code</li>
            <li><span className="info-icon">📱</span> Works on any device</li>
            <li><span className="info-icon">🔗</span> Share invite link with one click</li>
          </ul>
          <div className="privacy-note">
            🔒 Your data is stored in Firebase Firestore and used only for this session.
            We never share it with third parties.
          </div>
        </div>
      </main>
    </div>
  );
}
