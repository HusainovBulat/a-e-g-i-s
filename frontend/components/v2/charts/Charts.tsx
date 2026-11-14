'use client';

import styles from './charts.module.css';

type Pt = { x: number; y: number };

function scale(values: number[], width: number, height: number, padX = 0, padY = 0, domain?: [number, number]): Pt[] {
  const min = domain ? domain[0] : Math.min(...values);
  const max = domain ? domain[1] : Math.max(...values);
  const range = max - min || 1;
  const step = (width - padX * 2) / Math.max(values.length - 1, 1);
  return values.map((v, i) => ({ x: padX + i * step, y: height - padY - ((v - min) / range) * (height - padY * 2) }));
}

const toPoints = (pts: Pt[]) => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export function Sparkline({ values, color = 'var(--blue)', label }: { values: number[]; color?: string; label: string }) {
  if (values.length < 2) return null;
  const pts = scale(values, 100, 40, 1, 4);
  const last = pts[pts.length - 1];
  return (
    <svg className={styles.sparkline} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={`${pts[0].x},40 ${toPoints(pts)} ${last.x},40`} fill={color} opacity=".1" stroke="none" />
      <polyline points={toPoints(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Two-curve forecast (readiness without rest vs with recovery quests), 0..100 domain. */
export function ForecastChart({ baseline, withQuests, labels = ['Now', '+4 h', '+8 h', '+12 h'] }: { baseline: number[]; withQuests: number[]; labels?: string[] }) {
  const W = 600, H = 200, P = 8;
  const a = scale(baseline, W, H, P, P, [0, 100]);
  const b = scale(withQuests, W, H, P, P, [0, 100]);
  const yFor = (v: number) => H - P - (v / 100) * (H - P * 2);
  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Readiness forecast with and without recovery quests">
        {[85, 60].map(v => <line key={v} x1={P} x2={W - P} y1={yFor(v)} y2={yFor(v)} className={styles.threshold} />)}
        <polyline points={toPoints(a)} fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        <polyline points={toPoints(b)} fill="none" stroke="var(--blue)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={styles.axis}>{labels.map(l => <span key={l}>{l}</span>)}</div>
    </div>
  );
}

/** Route relief; the reachable part (up to the turn-back point) is highlighted. */
export function ElevationProfile({ values, position, turnaround }: { values: number[]; position: number; turnaround: number }) {
  const W = 800, H = 200, P = 10;
  if (values.length < 2) return null;
  const pts = scale(values, W, H, P, 24);
  const at = (ratio: number): Pt => {
    const r = Math.max(0, Math.min(1, ratio)) * (pts.length - 1);
    const i = Math.floor(r), j = Math.min(pts.length - 1, i + 1), w = r - i;
    return { x: pts[i].x * (1 - w) + pts[j].x * w, y: pts[i].y * (1 - w) + pts[j].y * w };
  };
  const here = at(position);
  const turn = at(turnaround);
  const reachable = [...pts.filter(p => p.x < turn.x), turn];
  return (
    <svg className={styles.elevation} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Route elevation profile with current position and turn-back point">
      <polyline points={`${pts[0].x},${H} ${toPoints(pts)} ${pts[pts.length - 1].x},${H}`} fill="var(--raised)" stroke="none" />
      <polyline points={`${pts[0].x},${H} ${toPoints(reachable)} ${turn.x},${H}`} fill="rgba(91,156,255,.14)" stroke="none" />
      <polyline points={toPoints(pts)} fill="none" stroke="var(--border-strong)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <polyline points={toPoints(reachable)} fill="none" stroke="var(--blue)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <line x1={turn.x} x2={turn.x} y1={0} y2={H} stroke="var(--amber)" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
      <line x1={here.x} x2={here.x} y1={here.y} y2={H} stroke="var(--green)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <ellipse cx={here.x} cy={here.y} rx="7" ry="7" fill="var(--green)" stroke="var(--surface)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <ellipse cx={turn.x} cy={turn.y} rx="7" ry="7" fill="var(--amber)" stroke="var(--surface)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
