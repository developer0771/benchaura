// web/src/components/room/RoomError.tsx
// Renders the appropriate error UI based on error code.
// Gives the user a clear action to take instead of a cryptic message.

'use client';
import Link from 'next/link';
import type { SocketError } from '@/hooks/useSocket';

interface Props {
  error: SocketError;
  onDismiss?: () => void;
}

const ERROR_CONFIGS: Record<string, {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href?: string; onClick?: () => void };
}> = {
  ROOM_NOT_FOUND: {
    icon: '🔍',
    title: 'Room not found',
    description: 'This room code doesn\'t exist or the session has ended.',
    action: { label: 'Create a new room', href: '/join' },
  },
  ROOM_FULL: {
    icon: '👥',
    title: 'Room is full',
    description: 'This room has reached its participant limit (500). Ask the host to start a new room.',
    action: { label: 'Go back', href: '/' },
  },
  LIVEKIT_ERROR: {
    icon: '📡',
    title: 'Video service unavailable',
    description: 'Could not connect to the LiveKit media server. The host may need to configure LiveKit credentials, or your network may be blocking the connection.',
    action: { label: 'Retry', onClick: () => window.location.reload() },
  },
  INVALID_CODE: {
    icon: '❌',
    title: 'Invalid room code',
    description: 'The room code format is incorrect. Codes look like CS4-AB2X.',
    action: { label: 'Try again', href: '/join' },
  },
  CONNECTION_ERROR: {
    icon: '📡',
    title: 'Connection failed',
    description: 'Could not connect to the signaling server. Check your internet connection.',
    action: { label: 'Retry', onClick: () => window.location.reload() },
  },
  SERVER_SHUTDOWN: {
    icon: '🔄',
    title: 'Server is restarting',
    description: 'The server is briefly restarting. You\'ll be reconnected automatically.',
    action: { label: 'Reconnect now', onClick: () => window.location.reload() },
  },
};

const DEFAULT_ERROR = {
  icon: '⚠️',
  title: 'Something went wrong',
  description: 'An unexpected error occurred. Please try again.',
  action: { label: 'Refresh', onClick: () => window.location.reload() },
};

export function RoomError({ error, onDismiss }: Props) {
  const config = ERROR_CONFIGS[error.code] ?? DEFAULT_ERROR;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(6,6,8,0.92)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 300,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 22,
        padding: '48px 40px',
        textAlign: 'center',
        maxWidth: 400,
        width: '90%',
      }}>
        <div style={{ fontSize: 52, marginBottom: 20 }}>{config.icon}</div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 12,
        }}>
          {config.title}
        </h2>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: 15,
          lineHeight: 1.6,
          marginBottom: 28,
        }}>
          {config.description}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {config.action && (
            config.action.href ? (
              <Link href={config.action.href} className="btn btn-primary btn-full">
                {config.action.label}
              </Link>
            ) : (
              <button
                className="btn btn-primary btn-full"
                onClick={config.action.onClick}
              >
                {config.action.label}
              </button>
            )
          )}
          {onDismiss && (
            <button className="btn btn-ghost btn-full" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
        {/* Show raw error code in dev */}
        {process.env.NODE_ENV === 'development' && (
          <p style={{
            marginTop: 16,
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'var(--text-dim)',
          }}>
            {error.code}: {error.message}
          </p>
        )}
      </div>
    </div>
  );
}
