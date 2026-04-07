// web/src/components/room/RoomSkeleton.tsx
// Shown while ICE servers are loading and WebRTC is initializing.
// Prevents the jarring "empty grid → video appears" flash.

'use client';

export function RoomSkeleton() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 12,
      padding: 16,
      height: '100%',
      alignContent: 'start',
    }}>
      {[1, 2].map(i => (
        <div key={i} style={{
          position: 'relative',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          aspectRatio: '16/9',
          overflow: 'hidden',
        }}>
          {/* Shimmer animation */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
          {/* Avatar placeholder */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'var(--border2)',
          }} />
          {/* Name tag placeholder */}
          <div style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            width: 80,
            height: 22,
            borderRadius: 6,
            background: 'var(--border)',
          }} />
          {/* Mic indicator placeholder */}
          <div style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 32,
            height: 22,
            borderRadius: 6,
            background: 'var(--border)',
          }} />
        </div>
      ))}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
