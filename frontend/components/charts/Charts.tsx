'use client';

import styles from './charts.module.css';

export function Sparkline({ values, color = 'var(--blue-bright)', label }: { values: number[]; color?: string; label: string }) {
  const points = chartPoints(values, 100, 34, 3);
  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 100 34"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function TrendAreaChart({
  values,
  color = 'var(--blue-bright)',
  gradientId,
  label,
  height = 68,
}: {
  values: number[];
  color?: string;
  gradientId: string;
  label: string;
  height?: number;
}) {
  const width = 600;
  const insetX = 6;
  const insetY = 8;
  const chartVals = values.length === 0 ? [50, 50] : values.length === 1 ? [values[0], values[0]] : values;
  const points = chartPoints(chartVals, width, height, insetX, insetY);
  const pairs = points.trim().split(' ');
  const firstPt = pairs[0].split(',');
  const lastPt = pairs[pairs.length - 1].split(',').map(Number);
  const areaPoints = `${firstPt[0]},${height - insetY} ${points} ${lastPt[0]},${height - insetY}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ display: 'block', width: '100%', height: `${height}px`, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <line x1={insetX} x2={width - insetX} y1={insetY} y2={insetY} stroke="var(--line-dim)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1={insetX} x2={width - insetX} y1={height / 2} y2={height / 2} stroke="var(--line-dim)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <line x1={insetX} x2={width - insetX} y1={height - insetY} y2={height - insetY} stroke="var(--line-dim)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />

      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r="4"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function LineChart({ values, labels, color = 'var(--blue-bright)', label, secondaryValues }: { values: number[]; labels?: string[]; color?: string; label: string; secondaryValues?: number[] }) {
  const combined = secondaryValues && secondaryValues.length > 0 ? [...values, ...secondaryValues] : values;
  const jointMin = Math.min(...combined);
  const jointMax = Math.max(...combined);
  const primaryPoints = chartPoints(values, 600, 180, 16, 10, jointMin, jointMax);
  const secondaryPoints = secondaryValues && secondaryValues.length > 0 ? chartPoints(secondaryValues, 600, 180, 16, 10, jointMin, jointMax) : undefined;
  return (
    <div className={styles.chart}>
      <svg viewBox="0 0 600 180" role="img" aria-label={label} preserveAspectRatio="none">
        {[0, 1, 2, 3].map(i => <line key={i} x1="16" x2="590" y1={18 + i * 48} y2={18 + i * 48} className={styles.gridLine} />)}
        {secondaryPoints && <polyline points={secondaryPoints} fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
        {secondaryValues && secondaryValues.length > 0 && secondaryPoints && <circle cx={lastPoint(secondaryPoints).x} cy={lastPoint(secondaryPoints).y} r="4" fill="var(--amber)" />}
        <polyline points={primaryPoints} fill="none" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        {values.length > 0 && <circle cx={lastPoint(primaryPoints).x} cy={lastPoint(primaryPoints).y} r="4" fill={color} />}
      </svg>
      {labels && <div className={styles.chartLabels}>{labels.map(item => <span key={item}>{item}</span>)}</div>}
    </div>
  );
}

function getElevationPointAtRatio(
  values: number[],
  ratio: number,
  width = 700,
  height = 190,
  insetX = 10,
  insetY = 10
): { x: number; y: number } {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const x = insetX + clampedRatio * (width - insetX * 2);
  if (values.length === 0) return { x, y: height / 2 };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const rawIdx = clampedRatio * (values.length - 1);
  const idx0 = Math.floor(rawIdx);
  const idx1 = Math.min(values.length - 1, Math.ceil(rawIdx));
  const weight = rawIdx - idx0;

  const elevation = values[idx0] * (1 - weight) + values[idx1] * weight;
  const y = height - insetY - ((elevation - min) / range) * (height - insetY * 2);
  return { x, y };
}

export function ElevationProfile({
  values,
  position = 0.62,
  turnaround = 0.76,
}: {
  values: number[];
  position?: number;
  turnaround?: number;
}) {
  const points = chartPoints(values, 700, 190, 10, 10);
  const posCurrent = getElevationPointAtRatio(values, position, 700, 190, 10, 10);
  const posTurn = getElevationPointAtRatio(values, turnaround, 700, 190, 10, 10);

  return (
    <svg
      className={styles.elevation}
      viewBox="0 0 700 190"
      role="img"
      aria-label="Lunar route elevation profile with current position and walk-back turn-around point"
    >
      {[0, 1, 2, 3].map(i => (
        <line
          key={i}
          x1="10"
          x2="690"
          y1={24 + i * 48}
          y2={24 + i * 48}
          className={styles.gridLine}
        />
      ))}
      <polyline points={`10,180 ${points} 690,180`} fill="rgba(76,141,255,.12)" stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--blue-bright)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <line x1={posTurn.x} x2={posTurn.x} y1="10" y2="180" className={styles.turnaroundLine} />
      <line x1={posCurrent.x} x2={posCurrent.x} y1="10" y2="180" className={styles.positionLine} />

      {/* ORANGE DOT: Turn Back / Point of No Return EXACTLY ON RELIEF LINE */}
      <circle
        cx={posTurn.x}
        cy={posTurn.y}
        r="5.5"
        fill="var(--amber)"
        stroke="#fff"
        strokeWidth="1.8"
      />

      {/* GREEN DOT: You Are Here EXACTLY ON RELIEF LINE */}
      <circle
        cx={posCurrent.x}
        cy={posCurrent.y}
        r="5.5"
        fill="var(--green)"
        stroke="#fff"
        strokeWidth="1.8"
      />

      <text x={Math.max(10, Math.min(posTurn.x - 25, 620))} y="18" className={styles.annotation}>
        TURN BACK
      </text>
      <text x={Math.max(10, Math.min(posCurrent.x - 30, 620))} y="34" className={styles.annotation}>
        YOU ARE HERE
      </text>
    </svg>
  );
}

export function ForecastChart({ baseline, withQuests }: { baseline: number[]; withQuests: number[] }) {
  return <LineChart values={withQuests} secondaryValues={baseline} label="EVA readiness forecast with and without selected quests" labels={['NOW', '+4 H', '+8 H', '+12 H']} />;
}

function chartPoints(values: number[], width: number, height: number, insetX = 0, insetY = 0, forcedMin?: number, forcedMax?: number) {
  if (values.length === 0) return '';
  const min = forcedMin !== undefined ? forcedMin : Math.min(...values);
  const max = forcedMax !== undefined ? forcedMax : Math.max(...values);
  const range = max - min || 1;
  const step = (width - insetX * 2) / Math.max(values.length - 1, 1);
  return values.map((val, idx) => {
    const x = insetX + idx * step;
    const y = height - insetY - ((val - min) / range) * (height - insetY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function lastPoint(pointsString: string) {
  const pairs = pointsString.trim().split(' ');
  const [x, y] = pairs[pairs.length - 1].split(',').map(Number);
  return { x, y };
}
