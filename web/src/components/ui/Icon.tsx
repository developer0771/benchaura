// ─── components/ui/Icon.tsx ─────────────────────────────────────────────────
// Unified SVG icon system — replaces emoji icons everywhere.
// Uses currentColor so icons inherit color from their parent.

'use client';

type IconName =
  | 'mic' | 'micOff'
  | 'video' | 'videoOff'
  | 'screen' | 'screenStop'
  | 'chat' | 'phoneOff'
  | 'users' | 'copy' | 'share' | 'refresh'
  | 'check' | 'close' | 'shield' | 'eye' | 'eyeOff'
  | 'zap' | 'sparkle' | 'lock' | 'mail' | 'key' | 'user'
  | 'arrowRight' | 'crown' | 'wifi' | 'volume'
  | 'hd' | 'devices' | 'link' | 'signal'
  | 'hand' | 'smile' | 'timer' | 'play' | 'pause';

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className, filled }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
        </svg>
      );
    case 'micOff':
      return (
        <svg {...common}>
          <path d="M2 2l20 20" />
          <path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-1M19 11v1a6.94 6.94 0 0 1-.4 2.35" />
          <path d="M12 18v4M8 22h8" />
        </svg>
      );
    case 'video':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="M22 8l-6 4 6 4V8z" />
        </svg>
      );
    case 'videoOff':
      return (
        <svg {...common}>
          <path d="M2 2l20 20" />
          <path d="M10.66 6H14a2 2 0 0 1 2 2v3.34M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h.34" />
          <path d="M22 8l-6 4 6 4V8z" />
        </svg>
      );
    case 'screen':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4M12 7l-3 3M12 7l3 3M12 7v6" />
        </svg>
      );
    case 'screenStop':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <rect x="9" y="8" width="6" height="5" rx="1" fill="currentColor" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8 7.9 7.9 0 0 1-3.8-.95L3 21l1.97-5.9A8 8 0 1 1 21 12z" />
        </svg>
      );
    case 'phoneOff':
      return (
        <svg {...common}>
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92V19.92A2 2 0 0 1 19.81 22 19.79 19.79 0 0 1 2 4.18 2 2 0 0 1 4.11 2H7.11a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81A2 2 0 0 1 9.36 8.64L8.09 9.91" />
          <path d="M23 1L1 23" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}><path d="M20 6L9 17l-5-5" /></svg>
      );
    case 'close':
      return (
        <svg {...common}><path d="M18 6L6 18M6 6l12 12" /></svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'eyeOff':
      return (
        <svg {...common}>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <path d="M1 1l22 22" />
        </svg>
      );
    case 'zap':
      return (
        <svg {...common} fill={filled ? 'currentColor' : 'none'}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3l1.88 5.62L20 10l-5.62 1.88L12 18l-1.88-6.12L4 10l6.12-1.38L12 3z" />
          <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 7L2 7" />
        </svg>
      );
    case 'key':
      return (
        <svg {...common}>
          <circle cx="8" cy="15" r="4" />
          <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'arrowRight':
      return (
        <svg {...common}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      );
    case 'crown':
      return (
        <svg {...common} fill={filled ? 'currentColor' : 'none'}>
          <path d="M2 20h20M3 17l3-9 4 5 2-7 2 7 4-5 3 9" />
        </svg>
      );
    case 'wifi':
      return (
        <svg {...common}>
          <path d="M5 12.55a11 11 0 0 1 14 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="1" fill="currentColor" />
        </svg>
      );
    case 'volume':
      return (
        <svg {...common}>
          <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      );
    case 'hd':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M7 10v4M7 12h3M10 10v4M14 10v4M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5H14" />
        </svg>
      );
    case 'devices':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="12" height="10" rx="1" />
          <rect x="14" y="8" width="8" height="12" rx="1" />
          <path d="M6 18h4" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'signal':
      return (
        <svg {...common}>
          <path d="M2 20h2M8 16h2M14 12h2M20 8h2" />
          <path d="M3 20v-2M9 20v-6M15 20v-10M21 20v-14" />
        </svg>
      );
    case 'hand':
      return (
        <svg {...common} fill={filled ? 'currentColor' : 'none'}>
          <path d="M9 11V5.5a1.5 1.5 0 1 1 3 0V11" />
          <path d="M12 11V4a1.5 1.5 0 1 1 3 0v7" />
          <path d="M15 11V5.5a1.5 1.5 0 1 1 3 0V14" />
          <path d="M9 11V8a1.5 1.5 0 1 0-3 0v8a6 6 0 0 0 12 0v-2" />
        </svg>
      );
    case 'smile':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <path d="M9 9h.01M15 9h.01" />
        </svg>
      );
    case 'timer':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2M9 2h6M12 2v2" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common} fill={filled ? 'currentColor' : 'none'}>
          <path d="M6 4l14 8-14 8V4z" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common} fill={filled ? 'currentColor' : 'none'}>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      );
  }
}
