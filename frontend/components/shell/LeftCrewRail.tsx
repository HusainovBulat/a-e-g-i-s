'use client';

import { useState, useEffect, useRef } from 'react';
import { useConsole } from '../../lib/ConsoleProvider';
import { CREW_IDS, type CrewId, type Band } from '../../lib/api/types';
import { crewMeta, crewStatus, hasFall, envTitle } from '../../lib/crew';
import { normalizeEnvId } from '../../lib/api/client';
import { pushHistory } from '../../lib/status';
import { Sparkline } from '../charts/Charts';
import styles from './LeftCrewRail.module.css';

const CREW_TACTICAL_TAGS: Record<CrewId, string> = {
  A: 'EVA',
  B: 'SYS',
  C: 'MED',
  D: 'GEO',
};

const BAND_COLORS: Record<Band, string> = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
};

type History = Record<CrewId, { hr: number[]; spo2: number[] }>;
const emptyHistory = (): History => ({
  A: { hr: [72, 73, 72, 74, 73, 75, 74, 73], spo2: [98, 98.4, 98.2, 98.5, 98.4, 98.6] },
  B: { hr: [68, 69, 70, 69, 71, 70], spo2: [99, 98.8, 99.1, 99] },
  C: { hr: [74, 75, 73, 74, 76], spo2: [98, 98.2, 98.1, 98.3] },
  D: { hr: [80, 82, 81, 83, 82], spo2: [97, 97.5, 97.2, 97.4] },
});

export function LeftCrewRail() {
  const { frame, crew, setCrew, currentCrew } = useConsole();
  const [isHovered, setIsHovered] = useState(false);
  const [history, setHistory] = useState<History>(emptyHistory);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      hoverTimerRef.current = null;
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Maintain live stream history for sparklines
  useEffect(() => {
    if (!frame) return;
    setHistory(prev => {
      const next = { ...prev };
      for (const id of CREW_IDS) {
        const v = frame.crews[id]?.vitals;
        if (v) {
          next[id] = {
            hr: pushHistory(prev[id]?.hr ?? [], v.hr, 25),
            spo2: pushHistory(prev[id]?.spo2 ?? [], v.spo2, 25),
          };
        }
      }
      return next;
    });
  }, [frame]);

  return (
    <aside
      className={`${styles.rail} ${isHovered ? styles.railExpanded : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label="Crew & Live Telemetry Navigation Rail"
    >
      {/* Top Branding / Tactical Icon */}
      <div className={styles.railTop}>
        <div className={styles.brandLogo}>A</div>
        {isHovered && (
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>A.E.G.I.S. CREW</span>
            <span className={styles.brandSubtitle}>LIVE TELEMETRY RAIL</span>
          </div>
        )}
      </div>

      {!isHovered ? (
        /* ================================================================= */
        /* Collapsed View (w-[68px]): 4 Vertical Compact Square Tiles        */
        /* ================================================================= */
        <div className={styles.collapsedRoster}>
          {CREW_IDS.map(id => {
            const state = id === crew ? (currentCrew ?? frame?.crews[id]) : frame?.crews[id];
            const { band, score } = crewStatus(state);
            const isSelected = crew === id;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.compactTile} ${isSelected ? styles.compactTileActive : ''}`}
                onClick={() => setCrew(id)}
                title={`${crewMeta[id].name} (${crewMeta[id].role}) — Health ${score}/100`}
                aria-pressed={isSelected}
              >
                <div className={styles.compactTopRow}>
                  <span className={`${styles.crewBadge} ${styles[`badge_${band}`]}`}>
                    {id}
                  </span>
                  <span className={styles.compactScore} style={{ color: BAND_COLORS[band] }}>
                    {score}
                  </span>
                </div>
                <span className={styles.compactLabel}>
                  {CREW_TACTICAL_TAGS[id]}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* ================================================================= */
        /* Expanded Overlay View (w-[280px]): Crew in Fixed A->B->C->D Order */
        /* Selected astronaut expands IN-PLACE in their fixed slot in list   */
        /* ================================================================= */
        <div className={styles.expandedBody}>
          <div className={styles.sectionHeading}>
            <span>Crew Roster // 1.0 Hz</span>
            <span className={styles.liveStreamBadge}>
              <span className={styles.liveDot} /> LIVE FEED
            </span>
          </div>

          <div className={styles.rosterList}>
            {CREW_IDS.map(id => {
              const isSelected = crew === id;
              const state = isSelected ? (currentCrew ?? frame?.crews[id]) : frame?.crews[id];
              const { band, score } = crewStatus(state);
              const meta = crewMeta[id];
              const isFallNow = hasFall(state);
              const isAlarmNow = Boolean(state?.alarm) || score < 60;
              const vitals = state?.vitals;
              const envName = vitals ? envTitle(normalizeEnvId(vitals.env)) : 'Lunar crater EVA';

              if (isSelected) {
                return (
                  <div key={id} className={styles.selectedCrewBlock}>
                    {/* Active astronaut header */}
                    <div className={styles.activeHeroCard}>
                      <div className={styles.heroHeaderRow}>
                        <div className={styles.heroAstronautInfo}>
                          <span className={`${styles.heroBadge} ${styles[`badge_${band}`]}`}>
                            {id}
                          </span>
                          <div className={styles.heroNames}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className={styles.heroName}>{meta.name}</span>
                              <span className={styles.activeTag}>ACTIVE</span>
                            </div>
                            <span className={styles.heroRole}>{meta.role}</span>
                          </div>
                        </div>

                        <div className={styles.heroScoreBox}>
                          <span className={styles.heroScoreVal} style={{ color: BAND_COLORS[band] }}>
                            {score}
                          </span>
                          <span className={styles.heroScoreLabel}>HEALTH INDEX</span>
                        </div>
                      </div>

                      <div className={styles.heroEnvTag}>
                        <span>🌐</span>
                        <span>{envName}</span>
                        {isFallNow ? (
                          <span style={{ color: '#EF4444', fontWeight: 700, marginLeft: 'auto' }}>🚨 FALL</span>
                        ) : isAlarmNow ? (
                          <span style={{ color: '#EF4444', fontWeight: 700, marginLeft: 'auto' }}>⚠️ ALARM</span>
                        ) : (
                          <span style={{ color: '#10B981', marginLeft: 'auto' }}>NOMINAL</span>
                        )}
                      </div>
                    </div>

                    {/* Full 11 Live Sensors Block right in place */}
                    {vitals && (
                      <div className={styles.sensorsBlock}>
                        {/* 1. Heart rate + Sparkline */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Heart rate</span>
                          <span className={styles.sensorSparkWrap}>
                            <Sparkline
                              values={history[id]?.hr ?? [72]}
                              color={vitals.hr > 120 || vitals.hr < 45 ? '#EF4444' : '#00e5ff'}
                              label="HR trend"
                            />
                          </span>
                          <span className={styles.sensorValue} style={{ color: vitals.hr > 120 ? '#EF4444' : '#edf3fa' }}>
                            {Math.round(vitals.hr)} <small>bpm</small>
                          </span>
                        </div>

                        {/* 2. SpO2 + Sparkline */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>SpO₂</span>
                          <span className={styles.sensorSparkWrap}>
                            <Sparkline
                              values={history[id]?.spo2 ?? [98]}
                              color={vitals.spo2 < 92 ? '#EF4444' : '#4c8dff'}
                              label="SpO2 trend"
                            />
                          </span>
                          <span className={styles.sensorValue} style={{ color: vitals.spo2 < 92 ? '#EF4444' : '#edf3fa' }}>
                            {vitals.spo2.toFixed(0)} <small>%</small>
                          </span>
                        </div>

                        {/* 3. Blood pressure */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Blood pressure</span>
                          <span className={styles.sensorValue} style={{ color: vitals.sys < 90 ? '#EF4444' : '#edf3fa' }}>
                            {Math.round(vitals.sys)}/{Math.round(vitals.dia)} <small>mmHg</small>
                          </span>
                        </div>

                        {/* 4. Breathing */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Breathing</span>
                          <span className={styles.sensorValue} style={{ color: vitals.resp > 24 ? '#F59E0B' : '#edf3fa' }}>
                            {Math.round(vitals.resp)} <small>/min</small>
                          </span>
                        </div>

                        {/* 5. Core temp */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Core temp</span>
                          <span className={styles.sensorValue} style={{ color: vitals.temp > 38 || vitals.temp < 35.5 ? '#F59E0B' : '#edf3fa' }}>
                            {vitals.temp.toFixed(1)} <small>°C</small>
                          </span>
                        </div>

                        {/* 6. Blood sugar */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Blood sugar</span>
                          <span className={styles.sensorValue} style={{ color: vitals.blood_sugar_mgdl < 70 ? '#F59E0B' : '#edf3fa' }}>
                            {Math.round(vitals.blood_sugar_mgdl)} <small>mg/dL</small>
                          </span>
                        </div>

                        {/* 7. Calf SmO2 */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Calf SmO₂</span>
                          <span className={styles.sensorValue} style={{ color: vitals.smo2 < 55 ? '#EF4444' : vitals.smo2 < 70 ? '#F59E0B' : '#10B981' }}>
                            {vitals.smo2.toFixed(0)} <small>%</small>
                          </span>
                        </div>

                        {/* 8. Muscle signal */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Muscle signal</span>
                          <span className={styles.sensorValue}>
                            {vitals.emg_mdf.toFixed(1)} <small>%</small>
                          </span>
                        </div>

                        {/* 9. Gait wobble */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Gait wobble</span>
                          <span className={styles.sensorValue}>
                            {vitals.gait.toFixed(2)} <small>SD</small>
                          </span>
                        </div>

                        {/* 10. Slope */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Slope</span>
                          <span className={styles.sensorValue}>
                            {Math.round(vitals.slope)} <small>°</small>
                          </span>
                        </div>

                        {/* 11. Walking speed */}
                        <div className={styles.sensorRow}>
                          <span className={styles.sensorLabel}>Walking speed</span>
                          <span className={styles.sensorValue}>
                            {vitals.speed.toFixed(1)} <small>km/h</small>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Non-selected astronaut in their slot:
              const statusText = isFallNow
                ? '🚨 Fall detected'
                : isAlarmNow
                ? '⚠️ Medical alarm'
                : vitals
                ? envTitle(normalizeEnvId(vitals.env))
                : 'Nominal';

              return (
                <div
                  key={id}
                  className={styles.rosterCard}
                  onClick={() => setCrew(id)}
                  role="button"
                  tabIndex={0}
                  title={`Switch to ${meta.name}`}
                >
                  <div className={styles.rosterLeft}>
                    <span className={`${styles.crewBadge} ${styles[`badge_${band}`]}`}>
                      {id}
                    </span>
                    <div className={styles.rosterMeta}>
                      <span className={styles.rosterName}>{meta.name}</span>
                      <span className={styles.rosterRole}>{meta.role}</span>
                      <span
                        className={styles.rosterStatus}
                        style={{ color: isFallNow || isAlarmNow ? '#EF4444' : 'var(--text-dim)' }}
                      >
                        {statusText}
                      </span>
                    </div>
                  </div>

                  <div className={styles.rosterScore} style={{ color: BAND_COLORS[band] }}>
                    {score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
