'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useConsole } from '../../../lib/ConsoleProvider';
import type { ConsoleEvent, Scenario } from '../../../lib/api/types';
import { crewMeta, environments } from '../../../lib/crew';
import type { Tone } from '../../../lib/status';
import { routinePrompts } from '../../../server/mock/content';
import { Drawer } from '../ui/Controls';
import { StatusPill } from '../ui/StatusPill';
import styles from './shell.module.css';

/** Used when /api/scenarios is unreachable. */
const fallbackScenarios: Array<Pick<Scenario, 'id' | 'name' | 'description'>> = [
  { id: 'normal_walk', name: 'Normal surface walk', description: '3° slope, nominal vitals' },
  { id: 'steep_climb', name: 'Steep crater climb', description: '18° LOLA slope, leg fatigue, walk-back countdown' },
  { id: 'fall_in_crater', name: 'Fall in crater', description: '30-second “are you OK” countdown, auto rescue call' },
  { id: 'chest_pain', name: 'Acute chest pain', description: 'ST elevation + low BP, nitroglycerin blocked' },
  { id: 'tired_says_fine', name: 'Hidden fatigue', description: 'Says 8/10, sensors say exhausted' },
  { id: 'reset_all', name: 'Reset to nominal', description: 'Clear alarms and restore baseline' },
];

const eventTone = (event: ConsoleEvent): Tone =>
  event.type === 'alarm_jump_to_emergency' ? 'red' : event.type === 'routine_prompt' ? 'amber' : event.type === 'ack' ? 'green' : 'blue';

export function DemoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, crew, environment, setEnvironment, frame } = useConsole();
  const [scenarios, setScenarios] = useState(fallbackScenarios);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [pairUrl, setPairUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    void api.getScenarios().then(list => { if (list.length) setScenarios(list); }).catch(() => {});
    setPairUrl('');
    void api.getPairing(crew)
      // The base server links the original phone page; v2 has its own.
      .then(p => setPairUrl(p.url.replace('/phone?', '/v2/phone?')))
      .catch(() => setPairUrl(`${window.location.origin}/v2/phone?crew=${crew}`));
  }, [open, api, crew]);

  const run = async (id: string, name: string) => {
    setRunning(id);
    try {
      await api.sendSensors({ crew, scenario: id });
      setMessage(`Started “${name}” for ${crewMeta[crew].name}`);
    } catch {
      setMessage('Could not reach the base server');
    } finally {
      setRunning(null);
    }
  };

  const events = (frame?.events ?? []).slice().reverse();

  return (
    <Drawer open={open} onClose={onClose} title="Demo controls">
      <div className={styles.drawerStack}>
        <section>
          <h3 className={styles.drawerTitle}>Scenarios · {crewMeta[crew].name}</h3>
          <div className={styles.scenarioList}>
            {scenarios.map(sc => (
              <button key={sc.id} type="button" title={sc.description} className={styles.scenarioItem} disabled={running !== null} onClick={() => run(sc.id, sc.name)}>
                <span>
                  <strong>{sc.name}</strong>
                  <small>{sc.description}</small>
                </span>
                <span className={styles.scenarioRun}>{running === sc.id ? 'Starting…' : 'Run'}</span>
              </button>
            ))}
          </div>
          {message && <p className={styles.drawerNote}>{message}</p>}
        </section>

        <section>
          <h3 className={styles.drawerTitle}>Environment</h3>
          <div className={styles.envList}>
            {environments.map(env => (
              <button key={env.id} type="button" className={`${styles.envItem} ${environment === env.id ? styles.envActive : ''}`} aria-pressed={environment === env.id} onClick={() => setEnvironment(env.id)}>
                <strong>{env.title}</strong>
                <small>{env.gravity} · {env.note}</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className={styles.drawerTitle}>Phone as suit sensors</h3>
          <div className={styles.pairBox}>
            <div className={styles.qr}>{pairUrl ? <QRCodeSVG value={pairUrl} size={132} bgColor="#ffffff" fgColor="#0b0f14" level="M" /> : <span>Loading…</span>}</div>
            <div>
              <p>Scan with a phone on the same network to stream sensors for <strong>{crewMeta[crew].name}</strong>.</p>
              {pairUrl && <code>{pairUrl}</code>}
              <a href={`/v2/visor?crew=${crew}`} target="_blank" rel="noreferrer">Open visor view ↗</a>
            </div>
          </div>
        </section>

        <section>
          <h3 className={styles.drawerTitle}>Scheduled checks</h3>
          <ul className={styles.plainList}>
            {routinePrompts.map(p => (
              <li key={p.id}><span className="num">{p.due.replace(' UTC', '')}</span><span>{p.title} · {p.duration}</span></li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className={styles.drawerTitle}>Event log</h3>
          {events.length ? (
            <ul className={styles.eventList}>
              {events.map((event, i) => (
                <li key={`${event.ts}-${i}`}>
                  <span className="num">{new Date(event.ts).toISOString().slice(11, 19)}</span>
                  <StatusPill tone={eventTone(event)}>{event.crew}</StatusPill>
                  <span>{event.text}</span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.drawerNote}>No events yet.</p>}
        </section>
      </div>
    </Drawer>
  );
}
