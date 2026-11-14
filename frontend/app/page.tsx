'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ElevationProfile, Sparkline } from '../components/charts/Charts';
import { BodyMapScreen } from '../components/bodymap/BodyMapScreen';
import { Mode1Screen } from '../components/mode1/Mode1Screen';
import { Mode2Screen } from '../components/mode2/Mode2Screen';
import { Mode3Screen } from '../components/mode3/Mode3Screen';
import { EventTicker, ModeTabs, TopBar } from '../components/shell/TopBar';
import { Panel } from '../components/ui/Panel';
import { NumberTicker } from '../components/ui/NumberTicker';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConsoleProvider, useConsole } from '../lib/ConsoleProvider';
import type { ConsoleEvent, CrewState } from '../lib/api/types';
import styles from './page.module.css';

const route = [12, 14, 17, 15, 20, 23, 21, 28, 26, 30, 34, 31, 39, 43, 41, 47, 45, 54, 51, 60, 58, 64, 69, 66, 75, 79, 73, 82, 88, 85, 94, 90, 98];

export default function Home() {
  return <ConsoleProvider><ConsoleContent /></ConsoleProvider>;
}

function ConsoleContent() {
  const { frame, connection, crew, setCrew, environment, setEnvironment, mode, setMode, currentCrew } = useConsole();
  const reducedMotion = useReducedMotion();
  return (
    <div className={styles.console}>
      <TopBar environment={environment} onEnvironmentChange={setEnvironment} crew={crew} onCrewChange={setCrew} connection={connection} />
      <div className={styles.content}>
        <ModeTabs value={mode} onChange={setMode} />
        <EventTicker events={frame?.events ?? []} />
      </div>
      <main className={styles.content}>
        <div className={styles.sectionMeta}>
          <div className={styles.metaLeft}><span>MISSION SOL 014</span><i className={styles.metaSeparator} /><span>{frame?.emitted_at.slice(11, 19) ?? '--:--:--'} UTC</span><i className={styles.metaSeparator} /><span>CREW {crew}</span></div>
          <div className={styles.metaRight}><StatusBadge tone={connection === 'connected' ? 'green' : connection === 'disconnected' ? 'red' : 'amber'} dot>{connection === 'connected' ? 'A.E.G.I.S. TELEMETRY LIVE' : connection === 'disconnected' ? 'RECONNECTING FEED' : 'CONNECTING'}</StatusBadge><span>STREAM 1.0 HZ</span></div>
        </div>
        {(Boolean(currentCrew?.vitals?.fall) || (currentCrew?.fall_countdown_s !== null && currentCrew?.fall_countdown_s !== undefined && currentCrew.fall_countdown_s > 0)) && mode !== 'mode2' && (
          <div style={{ background: 'rgba(239, 68, 68, 0.25)', border: '2px solid var(--red)', padding: '12px 20px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>🚨</span>
              <div>
                <strong style={{ color: 'var(--red)', fontSize: '13px', letterSpacing: '0.05em' }}>
                  CRITICAL: CREW {crew} FALL DETECTED IN CRATER — {Math.ceil(currentCrew?.fall_countdown_s ?? 30)}S RESCUE COUNTDOWN
                </strong>
                <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                  Suit 100% O2 purge armed · Rescue radar beacon transmitting
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode('mode2')}
              style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              OPEN RESCUE PROTOCOL ▸
            </button>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={mode} className={styles.screen} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -4 }} transition={{ duration: reducedMotion ? 0 : .22, ease: 'easeOut' }}>
            {mode === 'body_map' && <BodyMapOverview crew={currentCrew} events={frame?.events ?? []} connection={connection} />}
            {mode === 'mode1' && <Mode1Screen />}
            {mode === 'mode2' && <Mode2Screen />}
            {mode === 'mode3' && <Mode3Screen />}
          </motion.section>
        </AnimatePresence>
        <footer className={styles.footerNote}><span>A.E.G.I.S. / NASA SPACE APPS 2026 · AUTONOMOUS EVA HEALTH & SURVIVAL SYSTEM</span><span>HARD CLINICAL SAFETY INTERLOCK ACTIVE · NASA-STD-3001 VOL 1</span></footer>
      </main>
    </div>
  );
}

function BodyMapOverview({ crew, events, connection }: { crew: CrewState | null; events: ConsoleEvent[]; connection: 'connecting' | 'connected' | 'disconnected' }) {
  const vitals = crew?.vitals;
  const recentEvents = events.slice(-4).reverse();
  const hr = vitals?.hr ?? 72;
  const spo2 = vitals?.spo2 ?? 98.4;
  const resp = vitals?.resp ?? 14;

  const [hrHistory, setHrHistory] = useState<number[]>([70, 71, 72, 73, 72, 74, 73, 72]);
  const [spo2History, setSpo2History] = useState<number[]>([98.2, 98.4, 98.5, 98.3, 98.4, 98.6, 98.4]);
  const [respHistory, setRespHistory] = useState<number[]>([14, 14, 15, 14, 15, 14, 14]);

  useEffect(() => {
    // Physiological micro-variability (HRV & respiratory sinus arrhythmia) so the sparkline
    // breathes realistically around the live phone slider value instead of turning into a dead flatline
    if (vitals?.hr !== undefined) {
      const hrv = Math.sin(Date.now() / 1200) * 0.8 + Math.cos(Date.now() / 700) * 0.4;
      setHrHistory(prev => [...prev.slice(-24), Number((vitals.hr + hrv).toFixed(1))]);
    }
    if (vitals?.spo2 !== undefined) {
      const spo2Jitter = Math.sin(Date.now() / 2500) * 0.15;
      setSpo2History(prev => [...prev.slice(-24), Number(Math.min(100, Math.max(70, vitals.spo2 + spo2Jitter)).toFixed(1))]);
    }
    if (vitals?.resp !== undefined) {
      const respWave = Math.sin(Date.now() / 1800) * 0.5;
      setRespHistory(prev => [...prev.slice(-24), Number(Math.max(4, vitals.resp + respWave).toFixed(1))]);
    }
  }, [vitals?.t, vitals?.hr, vitals?.spo2, vitals?.resp]);

  return <>
    <BodyMapScreen crew={crew} connection={connection} />
    <div className={styles.telemetryGrid}>
      <TelemetryCard label="HEART RATE" value={hr.toFixed(0)} unit="BPM" delta="LIVE 1 HZ TELEMETRY" values={hrHistory} color="var(--red)" />
      <TelemetryCard label="OXYGEN SATURATION" value={spo2.toFixed(1)} unit="%" delta="LIVE 1 HZ TELEMETRY" values={spo2History} color="var(--green)" />
      <TelemetryCard label="RESPIRATORY RATE" value={resp.toFixed(0)} unit="BR/MIN" delta="LIVE 1 HZ TELEMETRY" values={respHistory} color="var(--blue-bright)" />
    </div>
    <div className={styles.lowerGrid}>
      {(() => {
        const walkBackMin = crew?.model_b?.walk_back_min ?? 45;
        const distanceM = crew?.model_b?.distance_m ?? (vitals?.distance_m ?? 1850);
        const totalRouteM = 4950;
        const currentPosRatio = Math.max(0.08, Math.min(0.88, distanceM / totalRouteM));
        const maxForwardMargin = 0.94 - currentPosRatio;
        const walkBackFactor = Math.max(0, Math.min(1, walkBackMin / 90));
        const turnaroundRatio = Math.max(
          currentPosRatio,
          Math.min(0.95, currentPosRatio + Math.max(0.02, maxForwardMargin * walkBackFactor))
        );
        return (
          <Panel eyebrow="LRO LOLA / SITE 04" title="Crater route elevation profile" action={<StatusBadge tone="blue">TRAVERSE {Math.round(currentPosRatio * 100)}%</StatusBadge>}>
            <div className={styles.routeHead}><span>RELATIVE ELEVATION TOPOGRAPHY</span><span>SHACKLETON RIM 5M/PX</span></div>
            <ElevationProfile values={route} position={currentPosRatio} turnaround={turnaroundRatio} />
            <div className={styles.routeFoot}><span>LUNAR BASE / 0 M</span><span>TURN-BACK MARGIN</span><span>CRATER RIDGE / 143 M</span></div>
          </Panel>
        );
      })()}
      <Panel eyebrow="MISSION EVENTS / TIMELINE" title="Real-time event log" action={<StatusBadge tone="neutral">LIVE STREAM</StatusBadge>}>
        <div className={styles.eventSummary}>
          {recentEvents.length ? recentEvents.map((event, index) => <div className={styles.eventSummaryItem} key={`${event.ts}-${index}`}><time>{new Date(event.ts).toISOString().slice(11, 19)}</time><i /><span>Crew {event.crew} · {event.text}</span></div>) : <div className={styles.eventSummaryItem}><time>--:--:--</time><i /><span>Autonomous flight telemetry nominal</span></div>}
        </div>
      </Panel>
    </div>
  </>;
}

function TelemetryCard({ label, value, unit, delta, values, color }: { label: string; value: string; unit: string; delta: string; values: number[]; color: string }) {
  return <Panel eyebrow={label} title="LIVE VITAL" action={<StatusBadge tone="blue" dot>1 HZ LIVE</StatusBadge>}>
    <div className={styles.telemetryCard}><div><div className={styles.telemetryValue}><NumberTicker value={value} /><small>{unit}</small></div><span className={styles.telemetryDelta}>{delta}</span></div><Sparkline values={values} color={color} label={`${label} recent trend`} /></div>
  </Panel>;
}

function ModePreview({ mode, code, title, description, metrics, alert = false }: { mode: string; code: string; title: string; description: string; metrics: [string, string][]; alert?: boolean }) {
  return <div className={styles.placeholderGrid}>
    <Panel eyebrow={code} title={mode} action={<StatusBadge tone={alert ? 'red' : 'blue'} dot>{alert ? 'STANDBY' : 'AUTONOMOUS'}</StatusBadge>}>
      <div className={styles.placeholderHero}><div><span className={styles.placeholderCode}>A.E.G.I.S. / CREW RESPONSE</span><h2>{title}</h2><p>{description}</p></div><div className={styles.simNotice}>AUTONOMOUS EVA TELEMETRY · BASE LINK ACTIVE</div></div>
    </Panel>
    <Panel eyebrow="MISSION PARAMETERS" title="Current status">
      <div className={styles.placeholderMetrics}>{metrics.map(([label, value]) => <div className={styles.metricTile} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </Panel>
  </div>;
}
