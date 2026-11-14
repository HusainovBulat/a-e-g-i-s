'use client';

import styles from './charts.module.css';

export function Sparkline({ values, color = 'var(--blue-bright)', label }: { values: number[]; color?: string; label: string }) {
  const points = chartPoints(values, 100, 34, 3);
  return <svg className={styles.sparkline} viewBox="0 0 100 34" role="img" aria-label={label}><polyline points={points} fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg>;
}

export function LineChart({ values, labels, color = 'var(--blue-bright)', label, secondaryValues }: { values: number[]; labels?: string[]; color?: string; label: string; secondaryValues?: number[] }) {
  const primaryPoints = chartPoints(values, 600, 180, 16, 10);
  const secondaryPoints = secondaryValues ? chartPoints(secondaryValues, 600, 180, 16, 10) : undefined;
  return (
    <div className={styles.chart}>
      <svg viewBox="0 0 600 180" role="img" aria-label={label} preserveAspectRatio="none">
        {[0, 1, 2, 3].map(i => <line key={i} x1="16" x2="590" y1={18 + i * 48} y2={18 + i * 48} className={styles.gridLine} />)}
        {secondaryPoints && <polyline points={secondaryPoints} fill="none" stroke="var(--amber)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        <polyline points={primaryPoints} fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        {values.length > 0 && <circle cx={lastPoint(primaryPoints).x} cy={lastPoint(primaryPoints).y} r="4" fill={color} />}
      </svg>
      {labels && <div className={styles.chartLabels}>{labels.map(item => <span key={item}>{item}</span>)}</div>}
    </div>
  );
}

export function ElevationProfile({ values, position = 0.62, turnaround = 0.76 }: { values: number[]; position?: number; turnaround?: number }) {
  const points = chartPoints(values, 700, 190, 10, 10);
  const x = 10 + Math.max(0, Math.min(1, position)) * 680;
  const returnX = 10 + Math.max(0, Math.min(1, turnaround)) * 680;
  return (
    <svg className={styles.elevation} viewBox="0 0 700 190" role="img" aria-label="Lunar route elevation profile with current position and walk-back turn-around point">
      {[0, 1, 2, 3].map(i => <line key={i} x1="10" x2="690" y1={24 + i * 48} y2={24 + i * 48} className={styles.gridLine} />)}
      <polyline points={`10,180 ${points} 690,180`} fill="rgba(76,141,255,.12)" stroke="none" />
      <polyline points={points} fill="none" stroke="var(--blue-bright)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <line x1={returnX} x2={returnX} y1="10" y2="180" className={styles.turnaroundLine} />
      <line x1={x} x2={x} y1="10" y2="180" className={styles.positionLine} />
      <circle cx={x} cy="93" r="5" fill="var(--green)" />
      <text x={Math.min(returnX + 6, 600)} y="18" className={styles.annotation}>TURN BACK</text>
      <text x={Math.min(x + 6, 640)} y="37" className={styles.annotation}>YOU ARE HERE</text>
    </svg>
  );
}

export function ForecastChart({ baseline, withQuests }: { baseline: number[]; withQuests: number[] }) {
  return <LineChart values={withQuests} secondaryValues={baseline} label="EVA readiness forecast with and without selected quests" labels={['NOW', '+4 H', '+8 H', '+12 H']} />;
}

function chartPoints(values: number[], width: number, height: number, insetX = 0, insetY = 0) {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = insetX + (values.length === 1 ? 0 : (index / (values.length - 1)) * (width - insetX * 2));
    const y = height - insetY - ((value - min) / range) * (height - insetY * 2);
    return `${x},${y}`;
  }).join(' ');
}

function lastPoint(points: string) {
  const pair = points.trim().split(' ').at(-1)?.split(',').map(Number) ?? [0, 0];
  return { x: pair[0], y: pair[1] };
}
