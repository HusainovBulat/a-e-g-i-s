'use client';

import type { ZoneId } from '../../lib/api/types';
import { bodyZones, scoreColor } from './zones';
import styles from './BodyMap.module.css';

export function SvgFallback({ scores, selectedZone, onSelectZone }: {
  scores: Record<ZoneId, number>;
  selectedZone: ZoneId | null;
  onSelectZone: (zone: ZoneId | null) => void;
}) {
  return <svg className={styles.fallbackSvg} viewBox="0 0 360 420" role="img" aria-label="Interactive suit health map, simplified SVG fallback">
    <defs>
      <linearGradient id="emu-shell" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#274361" stopOpacity=".78" /><stop offset="1" stopColor="#0a1421" stopOpacity=".94" /></linearGradient>
      <filter id="emu-glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <ellipse cx="180" cy="396" rx="78" ry="10" fill="rgba(76,141,255,.12)" stroke="#31527a" />
    <g className={styles.fallbackSuit} fill="url(#emu-shell)" stroke="#82a9d8" strokeWidth="1.5">
      <circle cx="180" cy="58" r="33" />
      <path d="M151 51 Q180 25 209 51 L205 73 Q180 89 155 73Z" fill="#07101b" />
      <path d="M153 99 L207 99 229 119 245 206 222 230 219 325 199 371 184 374 177 371 159 325 156 230 134 206 150 119Z" />
      <path d="M148 116 121 130 98 215 111 226 132 208 154 151M212 116 239 130 262 215 249 226 228 208 206 151" fill="url(#emu-shell)" />
      <path d="M157 111 203 111 211 151 149 151Z" fill="#1c3552" />
      <path d="M150 154 210 154 216 201 144 201Z" fill="#13283f" />
      <path d="M154 204 206 204 201 246 159 246Z" fill="#1c3552" />
      <path d="M161 247 180 255 176 326 160 350 151 322ZM199 247 180 255 184 326 200 350 209 322Z" />
      <path d="M151 359 176 359 173 381 143 381 143 371ZM184 359 209 359 218 371 218 381 187 381Z" fill="#112238" />
      <rect x="164" y="96" width="32" height="8" fill="#172e49" />
    </g>
    {bodyZones.map(zone => {
      const [x, y] = zone.fallbackPosition;
      const color = scoreColor(scores[zone.id]);
      const labelX = x < 180 ? 18 : x > 180 ? 222 : 113;
      const labelY = y - 10;
      return <g
        key={zone.id}
        className={styles.fallbackHotspot}
        role="button"
        tabIndex={0}
        aria-label={`Open ${zone.shortTitle}, index ${scores[zone.id]}`}
        aria-pressed={selectedZone === zone.id}
        onClick={() => onSelectZone(selectedZone === zone.id ? null : zone.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectZone(selectedZone === zone.id ? null : zone.id);
          }
        }}
        style={{ '--zone-color': color } as React.CSSProperties}
      >
        <line x1={x} y1={y} x2={x < 180 ? labelX + 120 : x > 180 ? labelX : x} y2={labelY + 13} stroke={color} strokeOpacity=".7" />
        <circle cx={x} cy={y} r={selectedZone === zone.id ? 9 : 6} fill={color} filter="url(#emu-glow)" />
        <circle cx={x} cy={y} r="15" className={styles.fallbackPulse} />
        <rect x={labelX} y={labelY} width="120" height="26" fill="#07101b" stroke={color} strokeOpacity=".72" />
        <text x={labelX + 7} y={labelY + 11} className={styles.fallbackCode}>{zone.code} · {zone.shortTitle}</text>
        <text x={labelX + 7} y={labelY + 22} className={styles.fallbackScore}>{scores[zone.id]} / 100</text>
      </g>;
    })}
  </svg>;
}
