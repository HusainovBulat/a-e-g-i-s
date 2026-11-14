'use client';

import type { ReactNode } from 'react';
import type { Tone } from '../../../lib/status';
import styles from './ui.module.css';

export function StatusPill({ children, tone = 'neutral', dot = true, pulse = false }: { children: ReactNode; tone?: Tone; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>
      {dot && <i className={`${styles.pillDot} ${pulse ? styles.pillPulse : ''}`} />}
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = 'blue', label }: { value: number; max?: number; tone?: Tone; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.progress} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={`${styles.progressFill} ${styles[`fill_${tone}`]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
