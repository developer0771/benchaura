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
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createRoom, joinRoom, upsertUserProfile, addToRoomHistory } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { generateRoomCode, isValidRoomCode } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

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

  // ── Google Sign-In ────────────────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setIsLoading(true);
    setErrors({});
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      // Pre-fill name and email from Google profile
      if (cred.user.displayName) setName(cred.user.displayName);
      if (cred.user.email)       setEmail(cred.user.email);
      // User is now authenticated. They still fill in course / room code and click submit.
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User dismissed — not an error worth showing
      } else if (code === 'auth/popup-blocked') {
        setErrors({ general: 'Popup was blocked by your browser. Please allow popups and try again.' });
      } else if (code === 'auth/account-exists-with-different-credential') {
        setErrors({ general: 'An account already exists with this email using a different sign-in method.' });
      } else {
        const message = err instanceof Error ? err.message : 'Google sign-in failed. Please try again.';
        setErrors({ general: message });
      }
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
                <Icon name="key" size={16} /> Login
              </button>
              <button
                type="button"
                className={`auth-mode-btn${authMode === 'register' ? ' active' : ''}`}
                onClick={() => setAuthMode('register')}
              >
                <Icon name="sparkle" size={16} /> Register
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

            {/* ── Google Sign-In (only if not signed in) ────────────────── */}
            {!firebaseUser && (
              <>
                <button
                  type="button"
                  className="google-btn"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  aria-label="Continue with Google"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="auth-divider"><span>or continue with email</span></div>

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
                      onClick={() => setRoomCode(generateRoomCode())}>
                      <Icon name="refresh" size={16} />
                    </button>
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

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={isLoading}>
              {isLoading ? (
                <><div className="btn-spinner" /> Please wait…</>
              ) : (
                <>
                  {firebaseUser
                    ? <Icon name="arrowRight" size={18} />
                    : authMode === 'login'
                      ? <Icon name="key" size={18} />
                      : <Icon name="sparkle" size={18} />
                  }
                  <span>
                    {firebaseUser
                      ? (tab === 'create' ? 'Create Room' : 'Join Room')
                      : authMode === 'login'
                        ? (tab === 'create' ? 'Login & Create Room' : 'Login & Join Room')
                        : (tab === 'create' ? 'Register & Create Room' : 'Register & Join Room')}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Side info panel ─────────────────────────────────────────────── */}
        <div className="join-info">
          <h3>What you get</h3>
          <ul className="info-list">
            <li><span className="info-icon"><Icon name="hd" size={18} /></span> HD video for up to 8 participants</li>
            <li><span className="info-icon"><Icon name="chat" size={18} /></span> Real-time group chat</li>
            <li><span className="info-icon"><Icon name="screen" size={18} /></span> Screen sharing</li>
            <li><span className="info-icon"><Icon name="lock" size={18} /></span> Private room with unique code</li>
            <li><span className="info-icon"><Icon name="devices" size={18} /></span> Works on any device</li>
            <li><span className="info-icon"><Icon name="link" size={18} /></span> Share invite link with one click</li>
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
