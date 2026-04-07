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

export function ConnectionQualityBadge({ quality, rtt }: Props) {
  const cfg = QUALITY_CONFIG[quality];

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
      {['good', 'degraded', 'poor'].map((level, i) => {
        const heights = [8, 12, 16];
        const isLit =
          quality === 'good' ||
          (quality === 'degraded' && i < 2) ||
          (quality === 'poor' && i < 1);

        return (
          <div
            key={level}
            style={{
              width: 3,
              height: heights[i],
              borderRadius: 1,
              background: isLit && quality !== 'unknown' && quality !== 'failed'
                ? cfg.color
                : 'var(--border2)',
              transition: 'background 0.5s',
            }}
          />
        );
      })}
      <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>
        {cfg.label}
      </span>
      {rtt !== null && (
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{rtt}ms</span>
      )}
    </div>
  );
}
