'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '../ui/Button';
import { Modal, Segmented, type SegmentOption } from '../ui/Controls';
import { Icon } from '../ui/icons';
import { StatusBadge } from '../ui/StatusBadge';
import { aegisApi } from '../../lib/api/client';
import { routinePrompts } from '../../server/mock/content';
import type { ConsoleEvent } from '../../lib/api/types';
import styles from './shell.module.css';

export type EnvironmentId = 'moon_base' | 'crater_eva' | 'rover' | 'mars_transit' | 'orbit_station';
export type CrewId = 'A' | 'B' | 'C' | 'D';
export type ConsoleMode = 'body_map' | 'mode1' | 'mode2' | 'mode3';

const environments: Array<{ id: EnvironmentId; short: string; title: string; gravity: string; radiation: string; hazard: string }> = [
  { id: 'moon_base', short: 'LUNAR BASE', title: 'Lunar Base Habitat', gravity: '0.16 g', radiation: '4.2 µSv/h', hazard: 'Regolith dust · confined atmosphere' },
  { id: 'crater_eva', short: 'CRATER EVA', title: 'Lunar Crater EVA', gravity: '0.16 g', radiation: '18.4 µSv/h', hazard: 'Thermal extremes · abrasive regolith' },
  { id: 'rover', short: 'ROVER', title: 'Pressurized Rover', gravity: '0.16 g', radiation: '12.1 µSv/h', hazard: 'Vibration · restricted mobility' },
  { id: 'mars_transit', short: 'MARS TRANSIT', title: 'Mars Transit', gravity: '0.00 g', radiation: '28.2 µSv/h', hazard: 'Radiation · 14 min comm delay' },
  { id: 'orbit_station', short: 'ORBIT', title: 'Orbital Station', gravity: '0.00 g', radiation: '15.5 µSv/h', hazard: 'Fluid shift · SANS exposure' },
];

const modeOptions: SegmentOption<ConsoleMode>[] = [
  { value: 'body_map', label: '01 / Body Map' },
  { value: 'mode1', label: '02 / EVA Warning' },
  { value: 'mode2', label: '03 / Emergency' },
  { value: 'mode3', label: '04 / Evening' },
];

export function TopBar({ environment, onEnvironmentChange, crew, onCrewChange, connection = 'connecting', events = [] }: { environment: EnvironmentId; onEnvironmentChange: (value: EnvironmentId) => void; crew: CrewId; onCrewChange: (value: CrewId) => void; connection?: 'connecting' | 'connected' | 'disconnected'; events?: ConsoleEvent[] }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.topbarMain}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark} aria-hidden="true"><span>A</span><i /></div>
          <div><div className={styles.brandName}>A.E.G.I.S.</div><div className={styles.brandSub}>EVA HEALTH SYSTEMS / MISSION CONTROL</div></div>
        </div>
        <div className={styles.missionStatus} aria-live="polite"><span className={`${styles.liveDot} ${connection === 'connected' ? styles.liveConnected : connection === 'disconnected' ? styles.liveDisconnected : ''}`} /><span>{connection === 'connected' ? 'AUTONOMOUS 1 HZ FEED ACTIVE' : connection === 'disconnected' ? 'RECONNECTING LINK' : 'NEGOTIATING 1 HZ FEED'}</span><b>01 HZ</b></div>
        <div className={styles.topbarActions}>
          <ScenarioLauncher crew={crew} />
          <RoutineBell events={events} />
          <CrewSelect crew={crew} onChange={onCrewChange} />
          <QrPairing crew={crew} />
        </div>
      </div>
      <div className={styles.environmentRail}>
        <EnvSwitcher environment={environment} onChange={onEnvironmentChange} />
      </div>
    </header>
  );
}

export function ScenarioLauncher({ crew }: { crew: CrewId }) {
  const [open, setOpen] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string>('normal_walk');
  const [running, setRunning] = useState(false);

  const scenariosList = [
    { id: 'normal_walk', name: 'Normal Surface Walk', desc: 'Slope 3°, nominal vitals, steady O2 consumption', badge: 'NOMINAL', tone: 'green' as const },
    { id: 'steep_climb', name: 'Steep Crater Climb (LOLA)', desc: 'Slope 18°, muscle fatigue desaturation, walk-back countdown', badge: 'FATIGUE', tone: 'amber' as const },
    { id: 'fall_in_crater', name: 'Fall in Crater (Emergency)', desc: 'Postural collapse, 30s wrist OK countdown, auto-SOS escalation', badge: 'CRITICAL', tone: 'red' as const },
    { id: 'chest_pain', name: 'Acute Coronary Ischemia', desc: 'ST elevation, severe hypotension, Nitroglycerin hard-block', badge: 'STEMI', tone: 'red' as const },
    { id: 'tired_says_fine', name: 'Evening Masking Behavior', desc: 'Subjective rating 8/10 contradicts objective muscle exhaustion', badge: 'MASKING', tone: 'amber' as const },
    { id: 'reset_all', name: 'Reset Nominal Baseline', desc: 'Clear all active alarms and restore nominal physiological baseline', badge: 'RESET', tone: 'blue' as const },
  ];

  const handleRun = async (scId: string) => {
    setActiveScenario(scId);
    setRunning(true);
    try {
      await aegisApi.sendSensors({ crew, scenario: scId });
      setOpen(false);
    } catch {
      // ignore
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button variant="secondary" icon="activity" onClick={() => setOpen(true)}>SCENARIOS</Button>
      <Modal open={open} onClose={() => setOpen(false)} eyebrow={`NASA MISSION SCENARIOS / CREW ${crew}`} title="Telemetry & Hazard Simulation">
        <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
          {scenariosList.map(sc => (
            <div
              key={sc.id}
              onClick={() => handleRun(sc.id)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: activeScenario === sc.id ? '1px solid var(--blue-bright)' : '1px solid var(--line-subtle)',
                background: activeScenario === sc.id ? 'rgba(0, 102, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                borderRadius: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '12px', color: 'var(--text-strong)' }}>{sc.name}</strong>
                  <StatusBadge tone={sc.tone}>{sc.badge}</StatusBadge>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sc.desc}</div>
              </div>
              <Button variant="ghost" size="sm" disabled={running}>
                TRIGGER ▸
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

export function EnvSwitcher({ environment, onChange }: { environment: EnvironmentId; onChange: (value: EnvironmentId) => void }) {
  const activeEnvironment = environments.find(item => item.id === environment) ?? environments[1];
  return <>
    <div className={styles.envButtons} aria-label="Mission environment">
      {environments.map(item => (
        <button type="button" key={item.id} className={`${styles.envButton} ${item.id === environment ? styles.envActive : ''}`} onClick={() => onChange(item.id)} aria-pressed={item.id === environment}>
          <span>{item.short}</span><i>{item.gravity}</i>
        </button>
      ))}
    </div>
    <div className={styles.envReadout} aria-live="polite">
      <div className={styles.envCurrent}><Icon name="globe" size={15} /><strong>{activeEnvironment.title}</strong></div>
      <span className={styles.envData}><span>GRAVITY <b>{activeEnvironment.gravity}</b></span><span>RADIATION <b>{activeEnvironment.radiation}</b></span></span>
      <span className={styles.envHazard}>{activeEnvironment.hazard}</span>
      <StatusBadge tone={environment === 'crater_eva' ? 'amber' : 'blue'}>{environment === 'crater_eva' ? 'SPACE SHIFT' : 'EARTH SHIFT'}</StatusBadge>
    </div>
  </>;
}

export function CrewSelect({ crew, onChange }: { crew: CrewId; onChange: (value: CrewId) => void }) {
  return <div className={styles.crewSelect}>
    <span className={styles.miniLabel}>CREW</span>
    <Segmented label="Select crew member" options={(['A', 'B', 'C', 'D'] as CrewId[]).map(id => ({ value: id, label: id }))} value={crew} onChange={onChange} />
  </div>;
}

export function RoutineBell({ events = [] }: { events?: ConsoleEvent[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'prompts' | 'logs'>('prompts');
  const firstPrompt = routinePrompts[0];
  const formatTime = (event: ConsoleEvent) => new Date(event.ts).toISOString().slice(11, 19);

  return <>
    <button type="button" className={styles.utilityButton} onClick={() => setOpen(true)} aria-label="Open Mission Routine & Logs">
      <Icon name="bell" />
      <span className={styles.bellCount}>{routinePrompts.length + (events.length > 0 ? 1 : 0)}</span>
    </button>
    <Modal open={open} onClose={() => setOpen(false)} eyebrow="MISSION DISPATCH / NOTIFICATIONS" title="Mission Prompts & Event Logs">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--line-dim)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setTab('prompts')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'prompts' ? '2px solid var(--blue-bright)' : '2px solid transparent',
            color: tab === 'prompts' ? 'var(--text-strong)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          ROUTINE PROMPTS ({routinePrompts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'logs' ? '2px solid var(--blue-bright)' : '2px solid transparent',
            color: tab === 'logs' ? 'var(--text-strong)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          MISSION LOGS ({events.length})
        </button>
      </div>

      {tab === 'prompts' ? (
        <>
          <div className={styles.promptList}>
            {routinePrompts.map((prompt, index) => (
              <article className={styles.promptItem} key={prompt.id}>
                <span className={styles.promptTime}>{prompt.due.replace(' UTC', '')}</span>
                <div>
                  <strong>{prompt.title}</strong>
                  <p>{prompt.duration} · Scheduled crew check</p>
                </div>
                <StatusBadge tone={index === 0 ? 'amber' : 'blue'}>{index === 0 ? 'DUE' : 'UP NEXT'}</StatusBadge>
              </article>
            ))}
          </div>
          <div className={styles.whyBlock}>
            <span className={styles.miniLabel}>WHY IS THIS EXAM NEEDED?</span>
            <p>{firstPrompt.why} This is a scheduled routine prompt for demonstration.</p>
          </div>
        </>
      ) : (
        <div className={styles.eventLogList}>
          {events.length ? (
            events.slice().reverse().map((event, index) => (
              <article className={styles.eventLogItem} key={`${event.ts}-${index}`}>
                <time>{formatTime(event)}Z</time>
                <StatusBadge tone={eventTone(event)}>{eventTone(event).toUpperCase()}</StatusBadge>
                <span>CREW {event.crew} · {event.text}</span>
              </article>
            ))
          ) : (
            <p className={styles.eventEmpty}>No mission events recorded yet.</p>
          )}
        </div>
      )}
    </Modal>
  </>;
}

export function QrPairing({ crew }: { crew: CrewId }) {
  const [open, setOpen] = useState(false);
  const [pairUrl, setPairUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const openPairing = () => {
    setOpen(true);
    setLoading(true);
    setPairUrl('');
    void aegisApi.getPairing(crew).then(pairing => setPairUrl(pairing.url)).catch(() => {
      setPairUrl(`${window.location.origin}/phone?crew=${crew}`);
    }).finally(() => setLoading(false));
  };
  return <>
    <Button variant="primary" icon="phone" onClick={openPairing}>PAIR PHONE</Button>
    <Modal open={open} onClose={() => setOpen(false)} eyebrow={`SENSOR LINK / CREW ${crew}`} title="Pair mobile console" className={styles.qrModal}>
      <div className={styles.qrBody}>
        <div className={styles.qrFrame}>{pairUrl ? <QRCodeSVG value={pairUrl} size={172} bgColor="#f3f6fa" fgColor="#09111a" level="M" /> : <span className={styles.qrLoading}>{loading ? 'REQUESTING LINK' : 'LINK UNAVAILABLE'}</span>}</div>
        <p>Scan to open the sensor simulator for <strong>CREW {crew}</strong>. Phone and console share the local demo feed.</p>
        {pairUrl && <code>{pairUrl}</code>}
        <StatusBadge tone={pairUrl ? 'green' : 'amber'} dot>{pairUrl ? 'LOCAL NETWORK LINK' : 'WAITING FOR API'}</StatusBadge>
      </div>
    </Modal>
  </>;
}

export function ModeTabs({ value, onChange }: { value: ConsoleMode; onChange: (value: ConsoleMode) => void }) {
  return <nav className={styles.modeTabs} aria-label="Console modes">
    {modeOptions.map((option, index) => <button key={option.value} type="button" className={`${styles.modeTab} ${value === option.value ? styles.modeTabActive : ''} ${option.value === 'mode2' ? styles.emergencyTab : ''}`} aria-current={value === option.value ? 'page' : undefined} onClick={() => onChange(option.value)}><span className={styles.modeNum}>0{index + 1}</span><span>{option.label.split(' / ')[1]}</span>{option.value === 'mode2' && <i className={styles.alarmDot} />}</button>)}
  </nav>;
}

function eventTone(event: ConsoleEvent): 'red' | 'amber' | 'blue' | 'green' {
  if (event.type === 'alarm_jump_to_emergency') return 'red';
  if (event.type === 'routine_prompt') return 'amber';
  if (event.type === 'ack') return 'green';
  return 'blue';
}

export function EventTicker({ events = [] }: { events?: ConsoleEvent[] }) {
  const [open, setOpen] = useState(false);
  const visibleEvents = events.slice(0, 2);
  const formatTime = (event: ConsoleEvent) => new Date(event.ts).toISOString().slice(11, 19);
  return <>
    <aside className={styles.eventTicker} aria-label="Recent mission events">
      <div className={styles.eventLabel}><Icon name="radio" size={15} /><span>MISSION LOG</span></div>
      <div className={styles.eventTrack}>
        {visibleEvents.length ? visibleEvents.map((event, index) => (
          <div className={styles.eventItem} key={`${event.ts}-${index}`}>
            <time>{formatTime(event)}Z</time>
            <i className={styles[`event_${eventTone(event)}`]} />
            <span>CREW {event.crew} · {event.text}</span>
          </div>
        )) : (
          <div className={styles.eventItem}><span>AWAITING LIVE MISSION EVENTS</span></div>
        )}
      </div>
      <button className={styles.logButton} type="button" onClick={() => setOpen(true)}>
        FULL LOG <Icon name="arrowUpRight" size={13} />
      </button>
    </aside>
    <Modal open={open} onClose={() => setOpen(false)} eyebrow="DEMO EVENT STREAM" title="Mission event log">
      <div className={styles.eventLogList}>{visibleEvents.length ? visibleEvents.map((event, index) => <article className={styles.eventLogItem} key={`${event.ts}-${index}`}><time>{formatTime(event)}Z</time><StatusBadge tone={eventTone(event)}>{eventTone(event).toUpperCase()}</StatusBadge><span>CREW {event.crew} · {event.text}</span></article>) : <p className={styles.eventEmpty}>No mission events have been received yet.</p>}</div>
    </Modal>
  </>;
}
