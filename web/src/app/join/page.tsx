// ─── app/join/page.tsx ────────────────────────────────────────────────────────
// Join / Create room page with Email + Password authentication.
// Also supports join links: /join?room=XX0-ABCD

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createRoom, joinRoom, upsertUserProfile, addToRoomHistory } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { generateRoomCode, isValidRoomCode } from '@/lib/utils';

type Tab = 'create' | 'join';

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setStudent, firebaseUser } = useAuthStore();

  const [tab, setTab] = useState<Tab>('create');

  // Form fields
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [course,     setCourse]     = useState('');
  const [roomCode,   setRoomCode]   = useState(() => generateRoomCode());
  const [joinCode,   setJoinCode]   = useState('');

  // UI state
  const [isLoading,  setIsLoading]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  // ── Pre-fill join code from share link (?room=XX0-ABCD) ──────────────────
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setJoinCode(roomParam.toUpperCase());
      setTab('join');
    }
  }, [searchParams]);

  // ── If already signed in & has a room, redirect ──────────────────────────
  useEffect(() => {
    if (firebaseUser) {
      const { student } = useAuthStore.getState();
      if (student?.currentRoomCode) {
        router.push(`/room/${student.currentRoomCode}`);
      }
    }
  }, [firebaseUser, router]);

  // ── Pre-fill name/email from Firebase if signed in ──────────────────────
  useEffect(() => {
    if (firebaseUser) {
      if (!name) setName(firebaseUser.displayName || '');
      if (!email) setEmail(firebaseUser.email || '');
    }
  }, [firebaseUser, name, email]);

  // ── Validate form ─────────────────────────────────────────────────────────
  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';

    if (!firebaseUser) {
      if (!email.trim()) newErrors.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        newErrors.email = 'Enter a valid email';
      if (!password.trim()) newErrors.password = 'Password is required';
      else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    }

    if (tab === 'create') {
      if (!course.trim()) newErrors.course = 'Course is required';
    } else {
      if (!joinCode.trim()) newErrors.joinCode = 'Room code is required';
      else if (!isValidRoomCode(joinCode)) newErrors.joinCode = 'Invalid format. Example: CS4-AB2X';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Email + Password Sign-In / Sign-Up + Room Action ─────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});

    try {
      let uid = firebaseUser?.uid;
      let userEmail = firebaseUser?.email || email.trim();

      // Sign in or register if not already authenticated
      if (!uid) {
        const trimmedEmail = email.trim();
        let userCredential;

        try {
          // Try signing in first
          userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
        } catch (signInErr: unknown) {
          const code = (signInErr as { code?: string }).code;
          if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
            // User doesn't exist — create account
            userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
            // Set display name
            await updateProfile(userCredential.user, { displayName: name.trim() });
          } else if (code === 'auth/wrong-password') {
            throw new Error('Incorrect password. Please try again.');
          } else if (code === 'auth/too-many-requests') {
            throw new Error('Too many attempts. Please wait a moment and try again.');
          } else {
            throw signInErr;
          }
        }

        uid = userCredential.user.uid;
        userEmail = userCredential.user.email || trimmedEmail;
      }

      const userName = name.trim() || firebaseUser?.displayName || userEmail.split('@')[0];
      const userCourse = course.trim() || 'Not specified';

      // Save/update user profile in Firestore
      await upsertUserProfile(uid!, {
        name: userName,
        email: userEmail,
        course: userCourse,
      });

      // Execute room action
      if (tab === 'create') {
        await createRoom(roomCode, { uid: uid!, name: userName, course: userCourse });
        await addToRoomHistory(uid!, roomCode);
        setStudent({
          uid: uid!, name: userName, email: userEmail,
          course: userCourse, isHost: true, currentRoomCode: roomCode,
        });
        router.push(`/room/${roomCode}`);
      } else {
        const code = joinCode.trim().toUpperCase();
        const room = await joinRoom(code, { uid: uid!, name: userName });
        await addToRoomHistory(uid!, code);
        setStudent({
          uid: uid!, name: userName, email: userEmail,
          course: room.course, isHost: false, currentRoomCode: code,
        });
        router.push(`/room/${code}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrors({ general: message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-join">
      <div className="bg-orbs"><div className="bg-orb orb-1" /><div className="bg-orb orb-2" /></div>
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
            <h1>{searchParams.get('room') ? 'Join Room' : 'Join or Create a Room'}</h1>
            <p>Sign in with your email &amp; password — quick and simple.</p>
          </div>

          {/* Tabs (hide if coming from share link) */}
          {!searchParams.get('room') && (
            <div className="tabs">
              <button className={`tab${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>
                Create Room
              </button>
              <button className={`tab${tab === 'join' ? ' active' : ''}`} onClick={() => setTab('join')}>
                Join Room
              </button>
            </div>
          )}

          {errors.general && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'var(--red)', marginBottom: 16 }}>
              {errors.general}
            </div>
          )}

          {/* Already signed in indicator */}
          {firebaseUser && (
            <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: 'var(--green)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✓</span> Signed in as {firebaseUser.displayName || firebaseUser.email}
            </div>
          )}

          <form className="join-form" onSubmit={handleSubmit} noValidate>
            {/* Name field */}
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input id="name" className={`form-input${errors.name ? ' error' : ''}`}
                placeholder="e.g. Arjun Sharma"
                value={name} onChange={e => setName(e.target.value)} />
              <span className="form-error">{errors.name}</span>
            </div>

            {/* Email + Password (only if not already signed in) */}
            {!firebaseUser && (
              <>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" className={`form-input${errors.email ? ' error' : ''}`}
                    placeholder="e.g. arjun@college.edu"
                    value={email} onChange={e => setEmail(e.target.value)} />
                  <span className="form-error">{errors.email}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input id="password" type="password" className={`form-input${errors.password ? ' error' : ''}`}
                    placeholder="Min 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <span className="form-error">{errors.password}</span>
                  <p className="form-hint">New here? We'll create your account automatically.</p>
                </div>
              </>
            )}

            {/* Create-specific fields */}
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

            {/* Join-specific fields */}
            {tab === 'join' && (
              <div className="form-group">
                <label htmlFor="joinCode">Room Code</label>
                <input id="joinCode" className={`form-input${errors.joinCode ? ' error' : ''}`}
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
              ) : (
                tab === 'create' ? '🚀 Sign in & Create Room' : '🚀 Sign in & Join Room'
              )}
            </button>
          </form>
        </div>

        {/* Side info */}
        <div className="join-info">
          <h3>What you get</h3>
          <ul className="info-list">
            <li><span className="info-icon">🎥</span> HD video for up to 8 participants</li>
            <li><span className="info-icon">💬</span> Real-time group chat via Firebase</li>
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
