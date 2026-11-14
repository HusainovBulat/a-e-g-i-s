'use client';

import { crewMeta, envTitle } from '../../../lib/crew';
import type { VisorModel } from '../../../lib/visor';
import { OutsideView } from './OutsideView';
import styles from './visor.module.css';

/**
 * Helmet heads-up display. The visor is always in front of the astronaut's eyes,
 * so the centre stays clear (that is where they look); all data sits on the edges.
 */
export function VisorHud({ model, className = '' }: { model: VisorModel; className?: string }) {
  const m = model;
  // Walk-back limit only matters outside (crater EVA or rover traverse).
  const outside = m.env === 'crater_eva' || m.env === 'rover';
  return (
    <div className={`${styles.hud} ${m.alert ? styles[`alert_${m.alert}`] : ''} ${className}`} role="img" aria-label={`Helmet visor of crew ${m.crew}: ${m.command.text}`}>
      <OutsideView env={m.env} crew={m.crew} className={styles.view} />
      <div className={styles.rim} aria-hidden="true" />

      {/* top edge: whose helmet and where */}
      <div className={styles.tag}>{crewMeta[m.crew].name} · {envTitle(m.env)}</div>

      {/* top-left: time to the point of no return */}
      <div className={`${styles.corner} ${styles.tl}`}>
        {outside ? <>
          <span className={styles.label}>Turn back in</span>
          <strong className={`${styles.big} ${styles[`t_${m.walkBackTone}`]}`}>{m.walkBack}</strong>
          <span className={styles.bar}><i className={styles[`b_${m.walkBackTone}`]} style={{ width: `${m.walkBackPct}%` }} /></span>
        </> : <>
          <span className={styles.label}>Inside</span>
          <strong className={`${styles.mid} ${styles.t_green}`}>SAFE</strong>
        </>}
      </div>

      {/* top-right: oxygen and heart */}
      <div className={`${styles.corner} ${styles.tr}`}>
        <div className={styles.pair}>
          <span className={styles.label}>O₂</span>
          <strong className={`${styles.mid} ${styles[`t_${m.o2Tone}`]}`}>{m.o2 ?? '–'}<small>%</small></strong>
        </div>
        <div className={styles.pair}>
          <span className={styles.label}>HR</span>
          <strong className={`${styles.mid} ${styles[`t_${m.hrTone}`]}`}>{m.hr ?? '–'}</strong>
        </div>
      </div>

      {/* bottom-left: terrain */}
      <div className={`${styles.corner} ${styles.bl}`}>
        <span className={styles.label}>Slope</span>
        <strong className={styles.mid}>{m.slope ?? '–'}°</strong>
        <span className={styles.compass}>SW · 248°</span>
      </div>

      {/* bottom-right: legs and buddy */}
      <div className={`${styles.corner} ${styles.br}`}>
        <div className={styles.pair}>
          <span className={styles.label}>Legs</span>
          <strong className={`${styles.mid} ${styles[`t_${m.legsTone}`]}`}>{m.legs ?? '–'}</strong>
        </div>
        <div className={styles.pair}>
          <span className={styles.label}>Buddy {m.buddy}</span>
          <strong className={`${styles.mid} ${m.buddyDown ? styles.t_red : styles.t_green}`}>{m.buddyDown ? 'DOWN' : 'OK'}</strong>
        </div>
      </div>

      {/* right edge: direction to a fallen buddy */}
      {m.buddyDown && (
        <div className={styles.beacon}>
          <span>Buddy {m.buddy}</span>
          <strong>34 m ↗</strong>
        </div>
      )}

      {/* lower edge: the one order the astronaut should follow */}
      <div className={`${styles.command} ${styles[`c_${m.command.tone}`]}`}>{m.command.text}</div>
    </div>
  );
}

