import type { Band } from './api/types';

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

/** Organ / readiness score (0..100) -> traffic light. Same thresholds as core_math. */
export function scoreTone(score: number): Band {
  if (score >= 80) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

export const bandLabel: Record<Band, string> = { green: 'Nominal', amber: 'Caution', red: 'Critical' };

/** 24.5 -> "24:30"; an hour or more -> "5 h 25 m" (mm:ss would read as 325:43). */
export function formatMinutes(min: number): string {
  const safe = Math.max(0, min);
  if (safe >= 60) return `${Math.floor(safe / 60)} h ${String(Math.floor(safe % 60)).padStart(2, "0")} m`;
  const m = Math.floor(safe);
  const s = Math.floor((safe - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Keeps the last `size` values of a live stream. */
export function pushHistory(prev: number[], value: number | undefined, size = 40): number[] {
  if (value === undefined || Number.isNaN(value)) return prev;
  return [...prev.slice(-(size - 1)), value];
}
