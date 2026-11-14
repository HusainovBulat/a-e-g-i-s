'use client';

import type { ReactNode } from 'react';
import type { Tone } from '../../../lib/status';
import { Sparkline } from '../charts/Charts';
import styles from './ui.module.css';

const toneColor: Record<Tone, string> = {
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
  blue: 'var(--blue)',
  neutral: 'var(--text-2)',
};

interface MetricProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
  history?: number[];
  size?: 'md' | 'lg';
}

/** Label, one big number, unit, optional caption and live sparkline. */
export function Metric({ label, value, unit, hint, tone, history, size = 'md' }: MetricProps) {
  return (
    <div className={`${styles.metric} ${size === 'lg' ? styles.metricLg : ''}`}>
      <span className={styles.metricLabel}>{label}</span>
      <div className={styles.metricValue}>
        <strong className={`num ${tone && tone !== 'neutral' ? `tone-${tone}` : ''}`}>{value}</strong>
        {unit && <small>{unit}</small>}
      </div>
      {hint && <span className={styles.metricHint}>{hint}</span>}
      {history && history.length > 1 && (
        <div className={styles.metricSpark}>
          <Sparkline values={history} color={toneColor[tone ?? 'blue']} label={`${label} trend`} />
        </div>
      )}
    </div>
  );
}
