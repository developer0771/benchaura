// web/src/components/room/ConnectionQuality.tsx
// Shows a real-time connection quality badge in the room topbar.
// Green = good, yellow = degraded (packet loss / high RTT), red = poor.

'use client';
import type { ConnectionQuality } from '@/hooks/useConnectionQuality';

interface Props {
  quality: ConnectionQuality;
  rtt: number | null;
}

const QUALITY_CONFIG = {
  unknown:  { color: 'var(--text-dim)',   label: '···',  title: 'Measuring connection...' },
  good:     { color: 'var(--accent)',     label: 'Good', title: 'Connection is strong' },
  degraded: { color: '#f59e0b',           label: 'Fair', title: 'Connection is unstable' },
  poor:     { color: 'var(--red)',        label: 'Poor', title: 'Connection is poor — video may freeze' },
  failed:   { color: 'var(--red)',        label: 'Lost', title: 'Connection lost' },
};

// How many bars to light up for each quality level
const LIT_BARS: Record<ConnectionQuality, number> = {
  good: 3,
  degraded: 2,
  poor: 1,
  unknown: 0,
  failed: 0,
};

export function ConnectionQualityBadge({ quality, rtt }: Props) {
  const cfg = QUALITY_CONFIG[quality];
  const litCount = LIT_BARS[quality];

  return (
    <div
      title={`${cfg.title}${rtt ? ` (${rtt}ms)` : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 12, color: cfg.color,
        cursor: 'default',
      }}
    >
      {/* Three bars like a signal indicator */}
      {[8, 12, 16].map((height, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height,
            borderRadius: 1,
            background: i < litCount ? cfg.color : 'var(--border2)',
            transition: 'background 0.5s',
          }}
        />
      ))}
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>
        {cfg.label}
      </span>
      {rtt !== null && (
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{rtt}ms</span>
      )}
    </div>
  );
}
