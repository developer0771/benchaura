// web/src/components/ui/ErrorBoundary.tsx
// Catches React rendering errors in the video room and shows a graceful fallback.
// Without this, a single crashed component white-screens the entire room.
//
// Usage:
//   <ErrorBoundary fallback={<RoomError />}>
//     <VideoGrid ... />
//   </ErrorBoundary>

'use client';
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 16,
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ fontSize: 15 }}>Something went wrong in the video room.</p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
