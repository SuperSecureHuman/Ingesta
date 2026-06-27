import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Role } from '@/lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getStrength(pwd: string): { score: number; label: string } {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return { score, label: ['', 'Weak', 'Fair', 'Moderate', 'Strong', 'Strong'][Math.min(score, 5)] };
}

export const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-green-500', 'bg-green-400'];

export const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  editor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  viewer: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Less than 1 hour';
  if (hours < 24) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

export const FALLBACK_THUMB_SVG =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="%2318181b" width="200" height="120"/></svg>';

export const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.m4v',
  '.ts',
  '.wmv',
  '.flv',
  '.webm',
  '.mpeg',
  '.mpg',
];

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.includes(ext);
}

export function getResolutionLabel(height: number): string {
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return `${height}p`;
}

export function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
