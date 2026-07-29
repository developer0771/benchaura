// ─── lib/utils.ts ────────────────────────────────────────────────────────────
// Pure utility functions. No Firebase, no React — easy to test in isolation.

/**
 * Generate a readable room code like "CS4-AB2X".
 * Format: {SUBJECT_PREFIX}{NUMBER}-{4_RANDOM_CHARS}
 */
export function generateRoomCode(): string {
  const prefixes = ['CS', 'MA', 'PH', 'EC', 'ME', 'CH', 'BT', 'IT', 'EE', 'CE'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(Math.random() * 9) + 1;
  // Exclude visually confusing chars: 0, O, I, 1
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${prefix}${num}-${suffix}`;
}

/**
 * Get initials from a full name (max 2 chars).
 * "Arjun Sharma" → "AS"
 * "Priya" → "PR"
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return name.slice(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

/**
 * Format seconds into MM:SS string.
 * 75 → "01:15"
 */
export function formatTime(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate room code format.
 */
export function isValidRoomCode(code: string): boolean {
  return /^[A-Z]{2}\d-[A-Z0-9]{4}$/.test(code.toUpperCase());
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Deterministic gradient for an avatar bubble based on a stable key (uid or name).
 * Same key → same gradient, so a user's bubble color is consistent everywhere.
 */
export function avatarGradient(key: string): string {
  const palettes = [
    'linear-gradient(135deg,#00c896,#22d3ee)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#8b5cf6,#ec4899)',
    'linear-gradient(135deg,#10b981,#3b82f6)',
    'linear-gradient(135deg,#f472b6,#7c5cff)',
    'linear-gradient(135deg,#22d3ee,#7c5cff)',
    'linear-gradient(135deg,#fbbf24,#f472b6)',
    'linear-gradient(135deg,#00c896,#7c5cff)',
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return palettes[Math.abs(hash) % palettes.length];
}

/**
 * Format a Firestore-ish timestamp (Firestore Timestamp | Date | null) to "HH:MM" local time.
 */
export function formatChatTime(ts: unknown): string {
  if (!ts) return '';
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    const seconds = (ts as { seconds: number }).seconds;
    if (typeof seconds === 'number') date = new Date(seconds * 1000);
  }
  if (!date) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Debounce a function call.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
