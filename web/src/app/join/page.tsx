// ─── app/join/page.tsx ────────────────────────────────────────────────────────
// Join / Create room page with real authentication.
//
// AUTHENTICATION FLOW:
//  1. User fills out form (name, email, course)
//  2. We call sendSignInLinkToEmail() → Firebase emails a magic link
//  3. User clicks link → redirected to /join?apiKey=...&oobCode=...
//  4. isSignInWithEmailLink() detects this → signInWithEmailLink() completes sign-in
//  5. onAuthStateChanged fires in useAuthListener → student profile saved
//  6. Redirect to room

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createRoom, joinRoom, upsertUserProfile, addToRoomHistory } from '@/lib/firestore';
import { useAuthStore } from '@/store/useAuthStore';
import { generateRoomCode, isValidEmail, isValidRoomCode } from '@/lib/utils';

type Tab = 'create' | 'join';
type Step = 'form' | 'verifying' | 'completing';

// Where Firebase redirects after email link click
const getActionCodeSettings = () => ({
  url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/join`,
  handleCodeInApp: true,
});

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setStudent, firebaseUser } = useAuthStore();

  const [tab, setTab] = useState<Tab>('create');
  const [step, setStep] = useState<Step>('form');

  // Form fields
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [course,     setCourse]     = useState('');
  const [roomCode,   setRoomCode]   = useState(() => generateRoomCode());
  const [joinCode,   setJoinCode]   = useState('');

  // UI state
  const [isLoading,  setIsLoading]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [sentEmail,  setSentEmail]  = useState('');

  // ── Handle email link callback (page loaded after clicking magic link) ────
  useEffect(() => {
    const handleEmailCallback = async () => {
      if (!isSignInWithEmailLink(auth, window.location.href)) return;

      setStep('completing');
      // Retrieve the email we stored before sending the link
      const storedEmail = localStorage.getItem('benchaura_signin_email');
      if (!storedEmail) {
        setErrors({ general: 'Could not find your email. Please try signing in again.' });
        setStep('form');
        return;
      }

      try {
        const result = await signInWithEmailLink(auth, storedEmail, window.location.href);
        localStorage.removeItem('benchaura_signin_email');

        // Retrieve the pending room action
        const pendingAction = JSON.parse(localStorage.getItem('benchaura_pending_action') || '{}');
        localStorage.removeItem('benchaura_pending_action');

        const uid = result.user.uid;
        const { pendingName, pendingCourse, pendingRoomCode, pendingTab, pendingJoinCode } = pendingAction;

        // Save/update user profile in Firestore
        await upsertUserProfile(uid, {
          name: pendingName || storedEmail.split('@')[0],
          email: storedEmail,
          course: pendingCourse || 'Not specified',
        });

        // Execute the pending room action
        if (pendingTab === 'create') {
          await createRoom(pendingRoomCode, { uid, name: pendingName, course: pendingCourse });
          await addToRoomHistory(uid, pendingRoomCode);
          setStudent({
            uid, name: pendingName, email: storedEmail,
            course: pendingCourse, isHost: true, currentRoomCode: pendingRoomCode,
          });
          router.push(`/room/${pendingRoomCode}`);
        } else {
          const room = await joinRoom(pendingJoinCode, { uid, name: pendingName });
          await addToRoomHistory(uid, pendingJoinCode);
          setStudent({
            uid, name: pendingName, email: storedEmail,
            course: room.course, isHost: false, currentRoomCode: pendingJoinCode,
          });
          router.push(`/room/${pendingJoinCode}`);
        }

        // Clean the URL
        window.history.replaceState({}, '', '/join');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
        setErrors({ general: message });
        setStep('form');
      }
    };

    handleEmailCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── If already signed in, skip directly to room if they have one ──────────
  useEffect(() => {
    if (firebaseUser) {
      const { student } = useAuthStore.getState();
      if (student?.currentRoomCode) {
        router.push(`/room/${student.currentRoomCode}`);
      }
    }
  }, [firebaseUser, router]);

  // ── Validate form ─────────────────────────────────────────────────────────
  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim())  newErrors.name  = 'Name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!isValidEmail(email)) newErrors.email = 'Enter a valid email address';

    if (tab === 'create') {
      if (!course.trim()) newErrors.course = 'Course is required';
    } else {
      if (!joinCode.trim()) newErrors.joinCode = 'Room code is required';
      else if (!isValidRoomCode(joinCode)) newErrors.joinCode = 'Invalid format. Example: CS4-AB2X';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // ── Handle form submit → send magic link ──────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);

    try {
      // Store context so we can complete the action after email link click
      localStorage.setItem('benchaura_signin_email', email);
      localStorage.setItem('benchaura_pending_action', JSON.stringify({
        pendingName:     name.trim(),
        pendingCourse:   course.trim(),
        pendingRoomCode: roomCode,
        pendingTab:      tab,
        pendingJoinCode: joinCode.trim().toUpperCase(),
      }));

      await sendSignInLinkToEmail(auth, email, getActionCodeSettings());
      setSentEmail(email);
      setStep('verifying');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send sign-in email';
      setErrors({ general: message });
    } finally {
      setIsLoading(false);
    }
  }

  // ── Resend magic link ─────────────────────────────────────────────────────
  async function handleResend() {
    try {
      await sendSignInLinkToEmail(auth, sentEmail, getActionCodeSettings());
      setErrors({ general: '' });
    } catch {
      setErrors({ general: 'Failed to resend. Please try again.' });
    }
  }

  // ── Completing step (between clicking link and redirecting) ───────────────
  if (step === 'completing') {
    return (
      <div className="page-join">
        <div className="bg-orbs"><div className="bg-orb orb-1" /><div className="bg-orb orb-2" /></div>
        <div className="noise-overlay" />
        <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
          <div className="join-card" style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⚡</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginBottom: 12 }}>Setting up your room…</h2>
            <p style={{ color: 'var(--text-muted)' }}>Just a moment while we get everything ready.</p>
          </div>
        </main>
      </div>
    );
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
          {step === 'verifying' ? (
            /* ── Email sent — waiting for user to click link ── */
            <div className="auth-verify">
              <div className="verify-icon">✉️</div>
              <h2>Check your inbox</h2>
              <p>We sent a sign-in link to</p>
              <p className="email-highlight">{sentEmail}</p>
              <p style={{ marginTop: 12, fontSize: 14 }}>
                Click the link in the email to {tab === 'create' ? 'create your room' : 'join the room'}.
                The link expires in 15 minutes.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 16 }}>
                Didn't receive it? Check your spam folder, or{' '}
                <button className="resend-link" onClick={handleResend}>
                  resend the email
                </button>
              </p>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 24 }}
                onClick={() => setStep('form')}
              >
                ← Use a different email
              </button>
            </div>
          ) : (
            /* ── Main form ── */
            <>
              <div className="join-header">
                <h1>Join or Create a Room</h1>
                <p>No password needed — we'll send you a magic link.</p>
              </div>

              {/* Tabs */}
              <div className="tabs">
                <button className={`tab${tab === 'create' ? ' active' : ''}`} onClick={() => setTab('create')}>
                  Create Room
                </button>
                <button className={`tab${tab === 'join' ? ' active' : ''}`} onClick={() => setTab('join')}>
                  Join Room
                </button>
              </div>

              {errors.general && (
                <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,71,87,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: 'var(--red)', marginBottom: 16 }}>
                  {errors.general}
                </div>
              )}

              <form className="join-form" onSubmit={handleSubmit} noValidate>
                {/* Shared fields */}
                <div className="form-group">
                  <label htmlFor="name">Full Name</label>
                  <input id="name" className={`form-input${errors.name ? ' error' : ''}`}
                    placeholder="e.g. Arjun Sharma"
                    value={name} onChange={e => setName(e.target.value)} />
                  <span className="form-error">{errors.name}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="email">Student Email</label>
                  <input id="email" type="email" className={`form-input${errors.email ? ' error' : ''}`}
                    placeholder="arjun@college.edu"
                    value={email} onChange={e => setEmail(e.target.value)} />
                  <span className="form-error">{errors.email}</span>
                </div>

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
                    <><div className="btn-spinner" /> Sending link…</>
                  ) : (
                    tab === 'create' ? '✉️ Create Room & Send Link' : '✉️ Join Room & Send Link'
                  )}
                </button>
              </form>
            </>
          )}
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
            <li><span className="info-icon">✉️</span> No password — magic link login</li>
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
