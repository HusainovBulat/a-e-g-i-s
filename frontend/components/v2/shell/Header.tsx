'use client';

import { useConsole } from '../../../lib/ConsoleProvider';
import { CREW_IDS, type ConsoleMode } from '../../../lib/api/types';
import { crewMeta, hasFall } from '../../../lib/crew';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/icons';
import { StatusPill } from '../ui/StatusPill';
import styles from './shell.module.css';

const tabs: Array<{ id: ConsoleMode; label: string; icon: IconName }> = [
  { id: 'body_map', label: 'Body map', icon: 'body' },
  { id: 'mode1', label: 'EVA', icon: 'mountain' },
  { id: 'mode2', label: 'Emergency', icon: 'zap' },
  { id: 'mode3', label: 'Evening', icon: 'moon' },
];

/** Top strip: brand, view tabs, link status, clock, demo controls. */
export function TopBar({ onOpenDemo }: { onOpenDemo: () => void }) {
  const { frame, connection, mode, setMode } = useConsole();
  const anyEmergency = CREW_IDS.some(id => hasFall(frame?.crews[id]) || frame?.crews[id]?.alarm);
  const time = frame?.emitted_at ? frame.emitted_at.slice(11, 19) : '--:--:--';

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true"><Icon name="shield" size={22} strokeWidth={2.2} /></span>
        <div>
          <strong>A.E.G.I.S.</strong>
          <span>Crew health console</span>
        </div>
      </div>

      <nav className={styles.tabs} aria-label="Views">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${mode === tab.id ? styles.tabActive : ''}`}
            aria-current={mode === tab.id ? 'page' : undefined}
            onClick={() => setMode(tab.id)}
          >
            <Icon name={tab.icon} size={18} />
            <span>{tab.label}</span>
            {tab.id === 'mode2' && anyEmergency && <i className={styles.tabAlarm} aria-label="Active emergency" />}
          </button>
        ))}
      </nav>

      <div className={styles.topMeta}>
        <StatusPill tone={connection === 'connected' ? 'green' : connection === 'disconnected' ? 'red' : 'amber'} pulse={connection === 'connected'}>
          {connection === 'connected' ? 'Live' : connection === 'disconnected' ? 'Reconnecting' : 'Connecting'}
        </StatusPill>
        <span className={`${styles.clock} num`}>{time} UTC</span>
        <Button variant="secondary" size="sm" icon="sliders" onClick={onOpenDemo}>Demo controls</Button>
      </div>
    </header>
  );
}

/** Red strip when any crew member is down (hidden on that member's Emergency view). */
export function AlertStrip() {
  const { frame, crew, setCrew, mode, setMode } = useConsole();
  const fallen = CREW_IDS.find(id => hasFall(frame?.crews[id]));
  if (!fallen || (mode === 'mode2' && fallen === crew)) return null;
  const countdown = frame?.crews[fallen]?.fall_countdown_s ?? 0;
  return (
    <div className={styles.alertStrip} role="alert">
      <span className={styles.alertIcon} aria-hidden="true">!</span>
      <div>
        <strong>{crewMeta[fallen].name}: fall detected</strong>
        <span>{countdown > 0 ? `Automatic rescue call in ${Math.ceil(countdown)} s unless the astronaut confirms they are OK.` : 'Rescue protocol active.'}</span>
      </div>
      <Button variant="danger" onClick={() => { setCrew(fallen); setMode('mode2'); }}>Open emergency</Button>
    </div>
  );
}
