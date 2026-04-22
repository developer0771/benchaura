// ─── components/room/PermissionsGate.tsx ────────────────────────────────────
// Overlay shown before camera/mic access is granted.

'use client';
import { Icon } from '@/components/ui/Icon';

interface PermissionsGateProps {
  onAllowCamera: () => void;
  onAudioOnly:   () => void;
}

export function PermissionsGate({ onAllowCamera, onAudioOnly }: PermissionsGateProps) {
  return (
    <div className="permissions-overlay">
      <div className="permissions-card">
        <div className="perm-icon-wrap">
          <Icon name="video" size={36} strokeWidth={1.6} />
        </div>
        <h2>Camera &amp; Microphone Access</h2>
        <p>
          Benchaura needs your camera and microphone to connect you with your
          study group. Video is sent peer-to-peer — never stored on our servers.
        </p>
        <div className="perm-features">
          <div className="perm-feat"><Icon name="shield" size={16} /> End-to-end peer connection</div>
          <div className="perm-feat"><Icon name="lock" size={16} /> Private, room-coded access</div>
        </div>
        <button className="btn btn-primary btn-full btn-lg" onClick={onAllowCamera}>
          <Icon name="check" size={18} /> Allow access
        </button>
        <button className="btn btn-ghost btn-full" onClick={onAudioOnly}>
          <Icon name="volume" size={18} /> Continue with audio only
        </button>
      </div>
    </div>
  );
}
