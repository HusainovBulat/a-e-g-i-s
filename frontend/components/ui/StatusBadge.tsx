'use client';

import type { ReactNode } from 'react';
import styles from './ui.module.css';

export type StatusTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

export function StatusBadge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: StatusTone; dot?: boolean }) {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{dot && <i className={styles.badgeDot} />}{children}</span>;
}

export function SegmentBar({ value, tone = 'blue', label }: { value: number; tone?: StatusTone; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className={styles.segmentWrap} aria-label={label ? `${label}: ${safeValue}%` : `${safeValue}%`} role="img">
      <div className={`${styles.segmentTrack} ${styles[`segment_${tone}`]}`}>
        {Array.from({ length: 20 }, (_, index) => <span key={index} className={index < Math.round(safeValue / 5) ? styles.segmentActive : ''} />)}
      </div>
    </div>
  );
}
