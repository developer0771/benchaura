// ─── components/room/Pomodoro.tsx ───────────────────────────────────────────
// Shared study timer (Pomodoro) — the killer differentiator vs Zoom/Meet.
// Host controls start/pause/reset and picks phase/duration; everyone sees the
// same countdown in real-time (synced via the server `room:timer` socket event).
//
// How the ticker works:
//   When action === 'start', the display time is computed from:
//     remaining = startedAt + duration*1000 - now
//   No Firestore writes per second — just one socket message per state change.
//   When action === 'pause' or 'reset', we show `remaining` directly.

'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRoomStore, type TimerState, type TimerPhase } from '@/store/useRoomStore';
import { Icon } from '@/components/ui/Icon';

interface PomodoroProps {
  isHost: boolean;
  onChange: (t: TimerState) => void;
}

const PRESETS: Array<{ label: string; phase: TimerPhase; seconds: number }> = [
  { label: '25m Focus',  phase: 'focus', seconds: 25 * 60 },
  { label: '50m Focus',  phase: 'focus', seconds: 50 * 60 },
  { label: '5m Break',   phase: 'break', seconds: 5  * 60 },
  { label: '15m Break',  phase: 'break', seconds: 15 * 60 },
];

function formatMMSS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function Pomodoro({ isHost, onChange }: PomodoroProps) {
  const timer = useRoomStore(s => s.timer);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);

  // Re-render every 250 ms while running so the countdown stays visually smooth
  useEffect(() => {
    if (timer.action !== 'start' || timer.phase === 'idle') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [timer.action, timer.phase]);

  // Derive remaining seconds
  const remaining = useMemo(() => {
    if (timer.phase === 'idle') return 0;
    if (timer.action === 'start') {
      const deadline = timer.startedAt + timer.duration * 1000;
      return Math.max(0, Math.floor((deadline - now) / 1000));
    }
    // paused or reset — use stored remaining
    return Math.max(0, timer.remaining);
  }, [timer, now]);

  // Progress ratio 0..1 (for progress ring)
  const progress = timer.duration > 0
    ? Math.min(1, Math.max(0, 1 - remaining / timer.duration))
    : 0;

  // ── Host actions ──────────────────────────────────────────────────────────
  function startOrResume() {
    if (timer.phase === 'idle') {
      // Default: start a 25-minute focus session
      const preset = PRESETS[0];
      onChange({
        phase: preset.phase,
        action: 'start',
        duration: preset.seconds,
        startedAt: Date.now(),
        remaining: preset.seconds,
      });
      return;
    }
    // Resume: duration shrinks to whatever was remaining, clock restarts from now
    onChange({
      ...timer,
      action: 'start',
      duration: timer.remaining > 0 ? timer.remaining : timer.duration,
      startedAt: Date.now(),
    });
  }
  function pause() {
    onChange({ ...timer, action: 'pause', remaining });
  }
  function reset() {
    onChange({ phase: 'idle', action: 'reset', duration: 25 * 60, startedAt: 0, remaining: 25 * 60 });
  }
  function pickPreset(p: typeof PRESETS[number]) {
    onChange({
      phase: p.phase,
      action: 'start',
      duration: p.seconds,
      startedAt: Date.now(),
      remaining: p.seconds,
    });
    setOpen(false);
  }

  const phaseLabel =
    timer.phase === 'focus' ? 'Focus'
    : timer.phase === 'break' ? 'Break'
    : 'Ready';
  const isRunning = timer.action === 'start' && timer.phase !== 'idle';

  return (
    <div className={`pomodoro pomodoro-${timer.phase}${isRunning ? ' running' : ''}`}>
      {/* Phase ring */}
      <div className="pomo-ring" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" className="ring-track" />
          <circle
            cx="20" cy="20" r="17"
            className="ring-progress"
            strokeDasharray={2 * Math.PI * 17}
            strokeDashoffset={2 * Math.PI * 17 * (1 - progress)}
          />
        </svg>
      </div>

      <div className="pomo-body">
        <span className="pomo-phase">{phaseLabel}</span>
        <span className="pomo-time">{formatMMSS(remaining > 0 || timer.phase !== 'idle' ? remaining : 25 * 60)}</span>
      </div>

      {isHost ? (
        <div className="pomo-controls">
          {isRunning ? (
            <button type="button" className="pomo-btn" onClick={pause} title="Pause timer" aria-label="Pause timer">
              <Icon name="pause" size={14} filled />
            </button>
          ) : (
            <button type="button" className="pomo-btn primary" onClick={startOrResume} title="Start timer" aria-label="Start timer">
              <Icon name="play" size={14} filled />
            </button>
          )}
          <button type="button" className="pomo-btn" onClick={reset} title="Reset timer" aria-label="Reset timer">
            <Icon name="refresh" size={14} />
          </button>
          <button
            type="button"
            className={`pomo-btn${open ? ' open' : ''}`}
            onClick={() => setOpen(o => !o)}
            title="Change duration"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Icon name="timer" size={14} />
          </button>

          {open && (
            <div className="pomo-menu" role="menu">
              {PRESETS.map(p => (
                <button key={p.label} type="button" className="pomo-preset" onClick={() => pickPreset(p)} role="menuitem">
                  <span className={`pomo-dot pomo-dot-${p.phase}`} />
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className="pomo-host-hint" title="Only the host can control the timer">
          <Icon name="crown" size={12} filled /> host
        </span>
      )}
    </div>
  );
}
