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
