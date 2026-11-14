'use client';

import type { ReactNode } from 'react';
import type { CrewId, EnvId } from '../../../lib/api/types';

/**
 * What the astronaut sees through the visor. The scene depends on where they are
 * (crater, habitat, rover, transit, orbit) and is varied per crew member, so two
 * visors side by side are easy to tell apart.
 */
export function OutsideView({ env, crew, className }: { env: EnvId; crew: CrewId; className?: string }) {
  const i = 'ABCD'.indexOf(crew);
  const rnd = rng(hash(`${env}-${crew}`));
  const id = `ov-${env}-${crew}`;
  const scenes: Record<EnvId, () => ReactNode> = {
    crater_eva: () => <Crater id={id} i={i} rnd={rnd} />,
    moon_base: () => <Habitat id={id} i={i} rnd={rnd} />,
    rover: () => <Rover id={id} i={i} rnd={rnd} />,
    mars_transit: () => <Transit id={id} i={i} rnd={rnd} />,
    orbit_station: () => <Orbit id={id} i={i} rnd={rnd} />,
  };
  return (
    <svg className={className} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scenes[env]()}
    </svg>
  );
}

type SceneProps = { id: string; i: number; rnd: () => number };

function Stars({ rnd, n, maxY = 900 }: { rnd: () => number; n: number; maxY?: number }) {
  return <>{Array.from({ length: n }, (_, k) => (
    <circle key={k} cx={rnd() * 1600} cy={rnd() * maxY} r={0.6 + rnd() * 1.6} fill="#dfe6f0" opacity={0.25 + rnd() * 0.6} />
  ))}</>;
}

/** Jagged horizon line from left to right. */
function ridge(rnd: () => number, base: number, amp: number, steps = 10) {
  const pts = Array.from({ length: steps + 1 }, (_, k) => `${(k / steps) * 1600},${base - rnd() * amp}`);
  return `M0,900 L${pts.join(' L')} L1600,900 Z`;
}

function Earth({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <g>
    <circle cx={cx} cy={cy} r={r * 1.18} fill="#4c8dff" opacity=".15" />
    <circle cx={cx} cy={cy} r={r} fill="#2c6fd1" />
    <path d={`M${cx - r * .6},${cy - r * .3} q${r * .4},-${r * .3} ${r * .8},0 q-${r * .2},${r * .4} -${r * .7},${r * .5}Z`} fill="#3f9a5c" opacity=".9" />
    <path d={`M${cx - r * .9},${cy + r * .2} q${r},-${r * .25} ${r * 1.7},${r * .1}`} stroke="#fff" strokeWidth={r * .12} fill="none" opacity=".7" />
    <path d={`M${cx},${cy - r} a${r},${r} 0 0,0 0,${r * 2}`} fill="#000" opacity=".55" />
  </g>;
}

function Crater({ id, i, rnd }: SceneProps) {
  const sunLeft = i % 2 === 0;
  return <>
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6a6c72" /><stop offset="1" stopColor="#1d1e22" /></linearGradient>
      <linearGradient id={`${id}-sun`} x1={sunLeft ? '0' : '1'} y1="0" x2={sunLeft ? '1' : '0'} y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="#020306" />
    <Stars rnd={rnd} n={40} maxY={480} />
    <Earth cx={560 + i * 170} cy={190 + (i % 2) * 70} r={30 + i * 4} />
    <path d={ridge(rnd, 520, 90)} fill="#2b2c31" />
    <path d={ridge(rnd, 600, 45, 6)} fill="#3a3b41" />
    <path d={`M0,660 Q${400 + i * 120},${600 + rnd() * 40} 800,640 T1600,${620 + rnd() * 30} L1600,900 L0,900 Z`} fill={`url(#${id}-g)`} />
    {Array.from({ length: 3 }, (_, k) => {
      const cx = 200 + rnd() * 1200, cy = 700 + rnd() * 140, rx = 80 + rnd() * 160;
      return <g key={k}><ellipse cx={cx} cy={cy} rx={rx} ry={rx * .18} fill="#121316" opacity=".75" /><ellipse cx={cx} cy={cy - rx * .03} rx={rx} ry={rx * .18} fill="none" stroke="#8a8c92" strokeOpacity=".35" strokeWidth="3" /></g>;
    })}
    {Array.from({ length: 6 }, (_, k) => <ellipse key={`r${k}`} cx={rnd() * 1600} cy={690 + rnd() * 200} rx={6 + rnd() * 16} ry={4 + rnd() * 8} fill="#7d7f85" opacity=".6" />)}
    <rect width="1600" height="900" fill={`url(#${id}-sun)`} />
  </>;
}

function Habitat({ id, i, rnd }: SceneProps) {
  const portX = i % 2 === 0 ? 1150 : 430;
  const rackX = i % 2 === 0 ? 120 : 1080;
  const accent = ['#6ff0a8', '#5b9cff', '#ffc95a', '#ff8fd1'][i];
  return <>
    <defs>
      <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#262d38" /><stop offset="1" stopColor="#151a21" /></linearGradient>
      <clipPath id={`${id}-port`}><circle cx={portX} cy="360" r="160" /></clipPath>
    </defs>
    <rect width="1600" height="900" fill={`url(#${id}-wall)`} />
    {Array.from({ length: 9 }, (_, k) => <line key={k} x1={k * 200} y1="80" x2={k * 200} y2="700" stroke="#2f3846" strokeWidth="3" />)}
    <rect x="0" y="40" width="1600" height="40" fill="#303948" />
    <rect x="300" y="52" width="1000" height="14" rx="7" fill="#e8f1ff" opacity=".55" />
    <path d="M0,700 L1600,700 L1600,900 L0,900 Z" fill="#11151b" />
    <path d="M0,700 L1600,700" stroke="#3a4453" strokeWidth="4" />
    {/* porthole with the lunar surface outside */}
    <g clipPath={`url(#${id}-port)`}>
      <rect x={portX - 170} y="190" width="340" height="340" fill="#020306" />
      <Stars rnd={rnd} n={12} maxY={900} />
      <path d={`M${portX - 170},420 L${portX - 60},${380 + rnd() * 30} L${portX + 40},${400 + rnd() * 20} L${portX + 170},${370 + rnd() * 30} L${portX + 170},540 L${portX - 170},540 Z`} fill="#55575d" />
    </g>
    <circle cx={portX} cy="360" r="160" fill="none" stroke="#4a5566" strokeWidth="22" />
    {Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return <circle key={k} cx={portX + Math.cos(a) * 160} cy={360 + Math.sin(a) * 160} r="6" fill="#7a8698" />;
    })}
    {/* equipment rack */}
    <rect x={rackX} y="160" width="380" height="500" rx="10" fill="#1c222b" stroke="#353f4d" strokeWidth="3" />
    {Array.from({ length: 5 }, (_, k) => <g key={k}>
      <rect x={rackX + 24} y={190 + k * 92} width="332" height="70" rx="6" fill="#232b36" />
      <circle cx={rackX + 56} cy={225 + k * 92} r="7" fill={k === i ? '#ff6b66' : accent} opacity=".9" />
      <rect x={rackX + 86} y={215 + k * 92} width={120 + rnd() * 150} height="18" rx="4" fill="#2f3a48" />
    </g>)}
  </>;
}

function Rover({ id, i, rnd }: SceneProps) {
  return <>
    <defs><linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5f6167" /><stop offset="1" stopColor="#24252a" /></linearGradient></defs>
    <rect width="1600" height="900" fill="#020306" />
    <Stars rnd={rnd} n={25} maxY={420} />
    <Earth cx={1000 - i * 140} cy={200} r={28} />
    <path d={ridge(rnd, 470, 70)} fill="#2d2e33" />
    <path d={`M0,560 Q800,${500 + rnd() * 40} 1600,560 L1600,900 L0,900 Z`} fill={`url(#${id}-g)`} />
    {/* tyre tracks ahead */}
    <path d="M640,900 Q760,700 790,560 M960,900 Q850,700 810,560" stroke="#1a1b1f" strokeWidth="18" fill="none" opacity=".6" />
    {/* cabin: window frame, pillars, dashboard */}
    <path d="M0,0 L1600,0 L1600,900 L0,900 Z M140,90 L1460,90 L1520,600 L80,600 Z" fill="#0d1117" fillRule="evenodd" />
    <path d="M140,90 L80,600 M1460,90 L1520,600" stroke="#262d38" strokeWidth="26" />
    <path d="M0,640 Q800,560 1600,640 L1600,900 L0,900 Z" fill="#161b23" />
    {[[260, 690], [620, 670], [980, 670], [1240, 690]].map(([x, y], k) => (
      <g key={k}><rect x={x} y={y} width="220" height="110" rx="10" fill="#0b1520" stroke="#2c3a4d" strokeWidth="3" opacity=".6" />
        <path d={`M${x + 20},${y + 80} L${x + 70},${y + 50} L${x + 120},${y + 65} L${x + 200},${y + 30}`} stroke={k === i ? '#ffc95a' : '#5b9cff'} strokeWidth="4" fill="none" opacity=".45" /></g>
    ))}
  </>;
}

function Transit({ id, i, rnd }: SceneProps) {
  const mx = 300 + i * 330 + rnd() * 80, my = 260 + rnd() * 300, mr = 70 + i * 18;
  return <>
    <defs>
      <radialGradient id={`${id}-mars`} cx=".35" cy=".35" r=".8"><stop offset="0" stopColor="#f0a070" /><stop offset=".6" stopColor="#b5522c" /><stop offset="1" stopColor="#3a1408" /></radialGradient>
      <linearGradient id={`${id}-band`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#8fa8ff" stopOpacity="0" /><stop offset=".5" stopColor="#8fa8ff" stopOpacity=".12" /><stop offset="1" stopColor="#8fa8ff" stopOpacity="0" /></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="#010205" />
    <rect width="1600" height="900" fill={`url(#${id}-band)`} />
    <Stars rnd={rnd} n={140} />
    <circle cx={mx} cy={my} r={mr * 1.12} fill="#ff8a50" opacity=".12" />
    <circle cx={mx} cy={my} r={mr} fill={`url(#${id}-mars)`} />
    <path d={`M${mx - mr * .5},${my - mr * .2} q${mr * .4},${mr * .15} ${mr * .9},-${mr * .05}`} stroke="#5a2410" strokeWidth={mr * .08} fill="none" opacity=".7" />
  </>;
}

function Orbit({ id, i, rnd }: SceneProps) {
  const cx = 600 + i * 140, r = 1500;
  const left = i % 2 === 0;
  return <>
    <defs>
      <radialGradient id={`${id}-earth`} cx=".5" cy=".05" r=".6"><stop offset="0" stopColor="#5fb2ff" /><stop offset=".5" stopColor="#1d5fb8" /><stop offset="1" stopColor="#0a2550" /></radialGradient>
      <clipPath id={`${id}-clip`}><circle cx={cx} cy={r + 560} r={r} /></clipPath>
    </defs>
    <rect width="1600" height="900" fill="#010205" />
    <Stars rnd={rnd} n={60} maxY={520} />
    <circle cx={cx} cy={r + 560} r={r + 26} fill="#7fc4ff" opacity=".22" />
    <circle cx={cx} cy={r + 560} r={r} fill={`url(#${id}-earth)`} />
    <g clipPath={`url(#${id}-clip)`}>{Array.from({ length: 7 }, (_, k) => <ellipse key={k} cx={rnd() * 1600} cy={640 + rnd() * 240} rx={60 + rnd() * 140} ry={10 + rnd() * 18} fill="#fff" opacity=".35" />)}</g>
    {/* station truss in view */}
    <g transform={left ? 'translate(0,170)' : 'translate(1600,170) scale(-1,1)'}>
      <rect x="0" y="170" width="560" height="26" fill="#9aa4b2" />
      {Array.from({ length: 7 }, (_, k) => <path key={k} d={`M${k * 80},170 L${k * 80 + 40},196 L${k * 80 + 80},170`} stroke="#5e6876" strokeWidth="4" fill="none" />)}
      <rect x="380" y="40" width="150" height="120" fill="#2a3a66" stroke="#9aa4b2" strokeWidth="4" />
      <rect x="380" y="206" width="150" height="120" fill="#2a3a66" stroke="#9aa4b2" strokeWidth="4" />
    </g>
  </>;
}

function hash(s: string) {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32): same crew + place = same scene on every render. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
