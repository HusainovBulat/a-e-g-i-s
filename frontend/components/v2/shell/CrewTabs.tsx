'use client';

import { useEffect, useState } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import { normalizeEnvId } from '../../../lib/api/client';
import { CREW_IDS, type CrewId, type SensorPacket } from '../../../lib/api/types';
import { crewMeta, crewStatus, envTitle, hasFall } from '../../../lib/crew';
import { bandLabel, pushHistory, type Tone } from '../../../lib/status';
import { Sparkline } from '../charts/Charts';
import styles from './shell.module.css';

type History = Record<CrewId, { hr: number[]; spo2: number[] }>;
const emptyHistory = (): History => ({ A: { hr: [], spo2: [] }, B: { hr: [], spo2: [] }, C: { hr: [], spo2: [] }, D: { hr: [], spo2: [] } });

/**
 * Left column: one vertical tab per astronaut (label written horizontally).
 * The selected tab expands and is the only place that shows the raw sensor readings.
 */
export function CrewTabs() {
  const { frame, crew, setCrew } = useConsole();
  const [history, setHistory] = useState<History>(emptyHistory);

  useEffect(() => {
    if (!frame) return;
    setHistory(prev => {
      const next = { ...prev };
      for (const id of CREW_IDS) {
        const v = frame.crews[id]?.vitals;
        if (v) next[id] = { hr: pushHistory(prev[id].hr, v.hr, 30), spo2: pushHistory(prev[id].spo2, v.spo2, 30) };
      }
      return next;
    });
  }, [frame]);

  return (
    <nav className={styles.crewTabs} aria-label="Crew member">
      {CREW_IDS.map(id => {
        const state = frame?.crews[id];
        const { band, score } = crewStatus(state);
        const active = crew === id;
        const status = hasFall(state) ? 'Fall detected' : state?.alarm ? 'Medical alarm' : state ? envTitle(normalizeEnvId(state.vitals.env)) : 'No data';
        return (
          <div key={id} className={`${styles.crewTab} ${active ? styles.crewTabActive : ''} ${band === 'red' ? styles.crewTabAlarm : ''}`}>
            <button type="button" className={styles.crewTabHead} aria-expanded={active} onClick={() => setCrew(id)}>
              <span className={`${styles.crewAvatar} ${styles[`avatar_${band}`]}`}>{id}</span>
              <span className={styles.crewTabText}>
                <strong>{crewMeta[id].name}</strong>
                <span>{crewMeta[id].role}</span>
                <small className={band === 'red' ? 'tone-red' : undefined}>{status}</small>
              </span>
              <span className={`${styles.crewTabScore} num tone-${band}`} title={`${bandLabel[band]} · lowest system score`}>{score}</span>
            </button>
            {active && state && <Sensors v={state.vitals} hr={history[id].hr} spo2={history[id].spo2} />}
          </div>
        );
      })}
    </nav>
  );
}

function Sensors({ v, hr, spo2 }: { v: SensorPacket; hr: number[]; spo2: number[] }) {
  const rows: Array<{ label: string; value: string; unit?: string; tone?: Tone; trend?: number[] }> = [
    { label: 'Heart rate', value: `${Math.round(v.hr)}`, unit: 'bpm', tone: v.hr > 120 || v.hr < 45 ? 'red' : undefined, trend: hr },
    { label: 'SpO₂', value: v.spo2.toFixed(0), unit: '%', tone: v.spo2 < 92 ? 'red' : undefined, trend: spo2 },
    { label: 'Blood pressure', value: `${Math.round(v.sys)}/${Math.round(v.dia)}`, tone: v.sys < 90 ? 'red' : undefined },
    { label: 'Breathing', value: `${Math.round(v.resp)}`, unit: '/min', tone: v.resp > 24 ? 'amber' : undefined },
    { label: 'Core temp', value: v.temp.toFixed(1), unit: '°C', tone: v.temp > 38 || v.temp < 35.5 ? 'amber' : undefined },
    { label: 'Blood sugar', value: `${Math.round(v.blood_sugar_mgdl)}`, unit: 'mg/dL', tone: v.blood_sugar_mgdl < 70 ? 'amber' : undefined },
    { label: 'Calf SmO₂', value: v.smo2.toFixed(0), unit: '%', tone: v.smo2 < 50 ? 'amber' : undefined },
    { label: 'Muscle signal', value: v.emg_mdf.toFixed(1), unit: '%' },
    { label: 'Gait wobble', value: v.gait.toFixed(2), unit: 'SD' },
    { label: 'Slope', value: `${Math.round(v.slope)}°` },
    { label: 'Walking speed', value: v.speed.toFixed(1), unit: 'km/h' },
  ];
  return (
    <div className={styles.sensors}>
      <span className={styles.sensorsTitle}>Live sensors</span>
      {rows.map(r => (
        <div key={r.label} className={styles.sensorRow}>
          <span>{r.label}</span>
          {r.trend && r.trend.length > 1 ? <span className={styles.sensorSpark}><Sparkline values={r.trend} color={r.tone === 'red' ? 'var(--red)' : 'var(--blue)'} label={`${r.label} trend`} /></span> : <span />}
          <strong className={`num ${r.tone ? `tone-${r.tone}` : ''}`}>{r.value}{r.unit && <small>{r.unit}</small>}</strong>
        </div>
      ))}
    </div>
  );
}
