// ─── components/room/PermissionsGate.tsx ────────────────────────────────────
// Overlay shown before camera/mic access is granted.

'use client';

interface PermissionsGateProps {
  onAllowCamera: () => void;
  onAudioOnly:   () => void;
}

export function PermissionsGate({ onAllowCamera, onAudioOnly }: PermissionsGateProps) {
  return (
    <div className="permissions-overlay">
      <div className="permissions-card">
        <div className="perm-icon">🎥</div>
        <h2>Camera &amp; Microphone Access</h2>
        <p>
          Benchaura needs access to your camera and microphone to connect you
          with your study group. Your video is sent directly to other participants
          — it&apos;s never stored on our servers.
        </p>
        <button className="btn btn-primary" onClick={onAllowCamera}>
          Allow Access
        </button>
        <button className="btn btn-ghost" onClick={onAudioOnly}>
          Skip (Audio only)
        </button>
      </div>
    </div>
  );
}
