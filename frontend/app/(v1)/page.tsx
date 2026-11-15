'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkline } from '../../components/charts/Charts';
import { BodyMapScreen } from '../../components/bodymap/BodyMapScreen';
import { Mode1Screen } from '../../components/mode1/Mode1Screen';
import { Mode2Screen } from '../../components/mode2/Mode2Screen';
import { Mode3Screen } from '../../components/mode3/Mode3Screen';
import { ModeTabs, TopBar } from '../../components/shell/TopBar';
import { LeftCrewRail } from '../../components/shell/LeftCrewRail';
import { Panel } from '../../components/ui/Panel';
import { NumberTicker } from '../../components/ui/NumberTicker';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConsoleProvider, useConsole } from '../../lib/ConsoleProvider';
import { preloadVoskModel, usesOfflineVoiceModel } from '../../lib/speech';
import type { CrewState } from '../../lib/api/types';
import styles from './page.module.css';

export default function Home() {
  return <ConsoleProvider><ConsoleContent /></ConsoleProvider>;
}

function ConsoleContent() {
  const { frame, connection, crew, setCrew, environment, setEnvironment, mode, setMode, currentCrew } = useConsole();
  const reducedMotion = useReducedMotion();

  // Firefox < 160 has no native speech recognition: warm up the offline Vosk model as soon as
  // the console opens, so "Hold to speak" is ready before anyone reaches the Emergency tab.
  useEffect(() => {
    if (usesOfflineVoiceModel()) preloadVoskModel().catch(() => {});
  }, []);

  const isFallOrCount = Boolean(currentCrew?.vitals?.fall) || (currentCrew?.fall_countdown_s !== null && currentCrew?.fall_countdown_s !== undefined && currentCrew.fall_countdown_s > 0);
  const isSevereHypoxia = currentCrew?.vitals?.spo2 !== undefined && currentCrew.vitals.spo2 < 92;

  return (
    <div className={styles.console}>
      <LeftCrewRail />
      <TopBar environment={environment} onEnvironmentChange={setEnvironment} crew={crew} onCrewChange={setCrew} connection={connection} events={frame?.events ?? []} />
      <div className={styles.content}>
        <ModeTabs value={mode} onChange={setMode} />
      </div>
      <main className={styles.content}>
        <div className={styles.sectionMeta}>
          <div className={styles.metaLeft}><span>MISSION SOL 014</span><i className={styles.metaSeparator} /><span>{frame?.emitted_at.slice(11, 19) ?? '--:--:--'} UTC</span><i className={styles.metaSeparator} /><span>CREW {crew}</span></div>
          <div className={styles.metaRight}><StatusBadge tone={connection === 'connected' ? 'green' : connection === 'disconnected' ? 'red' : 'amber'} dot>{connection === 'connected' ? 'A.E.G.I.S. TELEMETRY LIVE' : connection === 'disconnected' ? 'RECONNECTING FEED' : 'CONNECTING'}</StatusBadge><span>STREAM 1.0 HZ</span></div>
        </div>
        {(isFallOrCount || isSevereHypoxia) && mode !== 'mode2' && (
          <div style={{ background: 'rgba(239, 68, 68, 0.25)', border: '2px solid var(--red)', padding: '12px 20px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>🚨</span>
              <div>
                <strong style={{ color: 'var(--red)', fontSize: '13px', letterSpacing: '0.05em' }}>
                  {isFallOrCount
                    ? `CRITICAL: CREW ${crew} FALL DETECTED IN CRATER — ${Math.ceil(currentCrew?.fall_countdown_s ?? 30)}S RESCUE COUNTDOWN`
                    : `CRITICAL: CREW ${crew} SEVERE HYPOXIA (SpO₂ ${(currentCrew?.vitals?.spo2 ?? 88).toFixed(1)}% < 92%) — 30S OVERRIDE COUNTDOWN`}
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
            {mode === 'body_map' && <BodyMapOverview crew={currentCrew} connection={connection} />}
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

function BodyMapOverview({ crew, connection }: { crew: CrewState | null; connection: 'connecting' | 'connected' | 'disconnected' }) {
  const vitals = crew?.vitals;
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
  </>;
}

function TelemetryCard({ label, value, unit, delta, values, color }: { label: string; value: string; unit: string; delta: string; values: number[]; color: string }) {
  return (
    <Panel eyebrow={label} title="LIVE VITAL" action={<StatusBadge tone="blue" dot>1 HZ LIVE</StatusBadge>}>
      <div className={styles.telemetryCard}>
        <div className={styles.telemetryCardHead}>
          <div className={styles.telemetryValue}>
            <NumberTicker value={value} />
            <small>{unit}</small>
          </div>
          <span className={styles.telemetryDelta}>{delta}</span>
        </div>
        <div className={styles.telemetrySparklineWrap}>
          <Sparkline values={values} color={color} label={`${label} recent trend`} />
        </div>
      </div>
    </Panel>
  );
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
