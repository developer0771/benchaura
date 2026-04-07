// ─── app/page.tsx ─────────────────────────────────────────────────────────────
// Landing page — migrated from index.html to Next.js.
// Differences from original:
// • Stats counter uses IntersectionObserver via useEffect (same logic, React pattern)
// • Navbar scroll uses useEffect
// • All event handlers are proper React onClick/onChange

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const countersRef = useRef<HTMLDivElement>(null);

  // Navbar scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Stats counter animation
  useEffect(() => {
    const stats = [
      { el: document.getElementById('stat-students'), target: 12000, suffix: '+' },
      { el: document.getElementById('stat-rooms'),    target: 4800,  suffix: '+' },
      { el: document.getElementById('stat-uptime'),   target: 98,    suffix: '%' },
      { el: document.getElementById('stat-countries'),target: 50,    suffix: '+' },
    ];

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const stat = stats.find(s => s.el === entry.target);
        if (!stat || !stat.el) return;
        let count = 0;
        const step = stat.target / 60;
        const timer = setInterval(() => {
          count = Math.min(count + step, stat.target);
          stat.el!.textContent = Math.floor(count).toLocaleString() + stat.suffix;
          if (count >= stat.target) clearInterval(timer);
        }, 20);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    stats.forEach(s => s.el && observer.observe(s.el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="page-home">
      {/* Ambient background */}
      <div className="bg-orbs">
        <div className="bg-orb orb-1" />
        <div className="bg-orb orb-2" />
      </div>
      <div className="noise-overlay" />

      {/* Navbar */}
      <header className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="nav-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">Benchaura</span>
        </div>
        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it Works</a>
          <Link href="/join" className="btn btn-sm btn-primary">Join Room</Link>
        </nav>
        <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">☰</button>
      </header>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="mobile-nav open">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how"      onClick={() => setMenuOpen(false)}>How it Works</a>
          <Link href="/join"  onClick={() => setMenuOpen(false)}>Join Room</Link>
        </div>
      )}

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-dot" />
          Free for all students
        </div>
        <h1 className="hero-title">
          Study Together.<br />
          <span className="gradient-text">Grow Together.</span>
        </h1>
        <p className="hero-sub">
          Benchaura is a real-time video collaboration platform built for students.
          Create a room, invite your class, and learn side by side — no downloads needed.
        </p>
        <div className="hero-cta">
          <Link href="/join" className="btn btn-primary btn-lg">
            <span>Start a Room</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
        </div>

        {/* Live demo preview */}
        <div className="hero-preview">
          <div className="preview-bar">
            <div className="preview-dots"><span /><span /><span /></div>
            <span className="preview-title">benchaura.app/room/CS4-AB2X</span>
          </div>
          <div className="preview-body">
            <div className="preview-grid">
              {[
                { initial: 'A', name: 'Arjun (You)', gradient: 'linear-gradient(135deg,#00c896,#0084ff)', active: true },
                { initial: 'P', name: 'Priya',       gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', active: false },
                { initial: 'R', name: 'Rohan',       gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', active: false },
                { initial: 'S', name: 'Sneha',       gradient: 'linear-gradient(135deg,#10b981,#3b82f6)', active: false },
              ].map((p) => (
                <div key={p.name} className={`preview-card${p.active ? ' active' : ''}`}>
                  <div className="preview-avatar" style={{ background: p.gradient }}>{p.initial}</div>
                  <span className="preview-name">{p.name}</span>
                  {p.active && <span className="preview-live">● LIVE</span>}
                </div>
              ))}
            </div>
            <div className="preview-controls">
              <span className="pc-btn">🎤</span>
              <span className="pc-btn">📷</span>
              <span className="pc-btn red">✕ Leave</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="stats-bar" ref={countersRef}>
        <div className="stat"><span id="stat-students" className="stat-num">0+</span><span className="stat-label">Students</span></div>
        <div className="stat-divider" />
        <div className="stat"><span id="stat-rooms"    className="stat-num">0+</span><span className="stat-label">Study Rooms</span></div>
        <div className="stat-divider" />
        <div className="stat"><span id="stat-uptime"   className="stat-num">0%</span><span className="stat-label">Uptime</span></div>
        <div className="stat-divider" />
        <div className="stat"><span id="stat-countries" className="stat-num">0+</span><span className="stat-label">Countries</span></div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="section-label">Platform Features</div>
        <h2 className="section-title">Everything your study group needs</h2>
        <div className="features-grid">
          {[
            { icon: '🎥', title: 'HD Video Conferencing', desc: 'Crystal-clear video with adaptive quality that works even on slower connections.', large: true },
            { icon: '💬', title: 'Live Chat',             desc: 'Share links, ask questions, and collaborate in real-time — backed by Firebase.' },
            { icon: '🖥️', title: 'Screen Sharing',        desc: 'Share your screen, slides, or code with one click. Perfect for group problem solving.' },
            { icon: '🔐', title: 'Private Rooms',         desc: 'Every session gets a unique room code. Only your study group can join.', large: true },
            { icon: '🔔', title: 'Noise Control',         desc: 'Mute/unmute your mic anytime. See who is speaking in real time.' },
            { icon: '📱', title: 'Works Everywhere',      desc: 'Runs in any modern browser on desktop, tablet, or mobile. Zero downloads.' },
          ].map((f) => (
            <div key={f.title} className={`feature-card${f.large ? ' feature-large' : ''}`}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="how" id="how">
        <div className="section-label">Simple Process</div>
        <h2 className="section-title">Up and running in 30 seconds</h2>
        <div className="steps">
          {[
            { num: '01', title: 'Enter your details', desc: 'Verify your email with a magic link. No password needed.' },
            { num: '02', title: 'Get a room code',    desc: 'A unique room code is generated. Share it with your study group.' },
            { num: '03', title: 'Study together',     desc: 'HD video, real-time chat, screen share — all in one place.' },
          ].map((s, i) => (
            <div key={s.num} style={{ display: 'contents' }}>
              <div className="step">
                <div className="step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
              {i < 2 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
        <div className="cta-center">
          <Link href="/join" className="btn btn-primary btn-lg">
            Create Your Room
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-brand">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">Benchaura</span>
        </div>
        <p className="footer-tagline">Built for students, by students.</p>
        <div className="footer-links">
          <Link href="/join">Join</Link>
          <Link href="/profile">Profile</Link>
          <a href="#">Privacy</a>
        </div>
        <p className="footer-copy">© {new Date().getFullYear()} Benchaura. All rights reserved.</p>
      </footer>
    </div>
  );
}
