import { clsx, type ClassValue } from 'clsx';

/** Tailwind-friendly className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

const GRADIENTS = [
  ['#7c5cff', '#22d3ee'],
  ['#fb5d8a', '#7c5cff'],
  ['#22d3ee', '#34d399'],
  ['#fbbf24', '#fb5d8a'],
  ['#60a5fa', '#7c5cff'],
  ['#34d399', '#22d3ee'],
  ['#f43f5e', '#fbbf24'],
  ['#9b82ff', '#fb5d8a'],
];

/** Deterministic gradient from a seed string — used for avatars/banners/thumbnails. */
export function gradientFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = GRADIENTS[hash % GRADIENTS.length];
  const angle = hash % 360;
  return `linear-gradient(${angle}deg, ${a}, ${b})`;
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Compact number formatting: 1234 -> 1.2K */
export function compact(n: number): string {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Relative time: "3m", "2h", "Yesterday", "Mar 4". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'Yesterday';
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** Milliseconds until an ISO time, clamped at 0. */
export function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Live now';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

/**
 * Minimal HTML-escaping for any user-authored string we render as text.
 * The app renders message content as React text nodes (already escaped), but
 * this is used where we build strings — defence-in-depth against XSS.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
