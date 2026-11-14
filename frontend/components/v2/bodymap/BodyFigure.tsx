'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import type { ZoneId } from '../../../lib/api/types';
import { scoreTone } from '../../../lib/status';
import { bodyZones } from './zones';
import styles from './BodyMap.module.css';

/** Mirror a path around the figure's centre line (x = 240). */
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${480 - Number(x)},${y}`);

// Spacesuit (EMU-style, front view). Left-side parts are mirrored for the right side.
const TORSO = 'M182,110 Q240,98 298,110 Q322,118 320,150 L312,238 Q308,262 302,280 L178,280 Q172,262 168,238 L160,150 Q158,118 182,110 Z';
const ARM = 'M180,114 Q152,116 145,146 L131,262 Q130,278 142,281 L160,282 Q171,280 172,266 L184,170 Z';
const GLOVE = 'M135,289 L167,289 Q172,306 165,319 Q150,328 137,319 Q130,305 135,289 Z';
const LEG = 'M183,292 L238,292 L236,424 L231,448 L197,448 L191,424 Z';
const BOOT = 'M193,448 L236,448 L238,482 Q238,494 228,494 L186,494 Q177,494 179,484 Q181,470 193,462 Z';
const JOINTS = 'M148,142 Q165,134 182,142 M137,206 Q156,213 176,206 M190,372 Q214,379 238,372';
const VISOR = 'M205,50 Q240,28 275,50 Q279,76 263,90 Q240,99 217,90 Q201,76 205,50 Z';

/** Organ shapes per zone, drawn on top of the suit. */
const zoneShapes: Record<ZoneId, ReactNode> = {
  cns: <ellipse cx="240" cy="56" rx="19" ry="15" />,
  resp: <><ellipse cx="215" cy="160" rx="19" ry="34" /><ellipse cx="265" cy="160" rx="19" ry="34" /></>,
  cardio: <path d="M254,194 C236,182 234,168 243,164 C249,162 254,166 254,170 C254,166 259,162 265,164 C274,168 272,182 254,194 Z" />,
  thermo: <ellipse cx="240" cy="222" rx="38" ry="12" />,
  metabolic: <ellipse cx="240" cy="258" rx="31" ry="18" />,
  musculo: <><ellipse cx="213" cy="360" rx="15" ry="46" /><ellipse cx="267" cy="360" rx="15" ry="46" /></>,
};

export function BodyFigure({ scores, selected = null, onSelect }: { scores: Record<ZoneId, number>; selected?: ZoneId | null; onSelect: (zone: ZoneId) => void }) {
  const keyHandler = (zone: ZoneId) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(zone); }
  };

  return (
    <svg className={styles.figure} viewBox="0 0 480 510" role="group" aria-label="Astronaut body map: six physiological systems coloured by health score">
      <defs>
        <linearGradient id="aegis-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3b52" />
          <stop offset="1" stopColor="#0b121c" />
        </linearGradient>
      </defs>

      {/* life-support backpack behind the suit */}
      <rect className={styles.pack} x="166" y="100" width="148" height="198" rx="22" />

      <g className={styles.suit}>
        <path d={ARM} /><path d={mirror(ARM)} />
        <path d={GLOVE} /><path d={mirror(GLOVE)} />
        <path d={LEG} /><path d={mirror(LEG)} />
        <path d={BOOT} /><path d={mirror(BOOT)} />
        <path d={TORSO} />
      </g>
      <g className={styles.rings}>
        <rect x="204" y="100" width="72" height="12" rx="6" />
        <rect x="174" y="278" width="132" height="16" rx="7" />
        <rect x="133" y="280" width="36" height="9" rx="4" />
        <rect x="311" y="280" width="36" height="9" rx="4" />
      </g>
      <path className={styles.joints} d={`${JOINTS} ${mirror(JOINTS)}`} />

      {/* helmet: clear bubble, gold-rimmed visor, side lights */}
      <rect className={styles.rings} x="187" y="42" width="9" height="18" rx="3" />
      <rect className={styles.rings} x="284" y="42" width="9" height="18" rx="3" />
      <circle className={styles.helmet} cx="240" cy="60" r="46" />
      <path className={styles.visor} d={VISOR} />
      <path className={styles.glare} d="M214,50 Q228,39 246,38" />

      {bodyZones.map(zone => {
        const score = Math.round(scores[zone.id]);
        const tone = scoreTone(score);
        const [ax, ay] = zone.anchor;
        const left = zone.side === 'left';
        const labelX = left ? 20 : 352;
        const lineEnd = left ? 128 : 352;
        const active = selected === zone.id;
        return (
          <g
            key={zone.id}
            className={`${styles.zone} ${styles[`zone_${tone}`]} ${active ? styles.zoneActive : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${zone.title}: ${score} of 100`}
            onClick={() => onSelect(zone.id)}
            onKeyDown={keyHandler(zone.id)}
          >
            <g className={styles.organ}>{zoneShapes[zone.id]}</g>
            <polyline className={styles.leader} points={`${ax},${ay} ${left ? ax - 16 : ax + 16},${zone.labelY} ${lineEnd},${zone.labelY}`} />
            <circle className={styles.anchor} cx={ax} cy={ay} r="4" />
            <rect className={styles.labelHit} x={labelX - 6} y={zone.labelY - 24} width="124" height="44" rx="8" />
            <text className={styles.labelName} x={labelX} y={zone.labelY - 6}>{zone.title}</text>
            <text className={styles.labelScore} x={labelX} y={zone.labelY + 15}>{score}<tspan dx="4">/ 100</tspan></text>
          </g>
        );
      })}
    </svg>
  );
}
