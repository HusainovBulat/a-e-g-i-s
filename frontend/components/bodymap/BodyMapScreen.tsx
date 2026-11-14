'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { zoneContent } from '../../server/mock/content';
import type { CrewState, ZoneId } from '../../lib/api/types';
import { Panel } from '../ui/Panel';
import { SegmentBar, StatusBadge } from '../ui/StatusBadge';
import { bodyZones, zoneTitles } from './zones';
import { SvgFallback } from './SvgFallback';
import styles from './BodyMap.module.css';

const SuitScene = dynamic(() => import('./SuitScene'), {
  ssr: false,
  loading: () => <div className={styles.sceneLoading}><span className={styles.loaderMark} /><span>INITIALIZING LOCAL EMU MODEL</span></div>,
});

export function BodyMapScreen({ crew, connection }: { crew: CrewState | null; connection: 'connecting' | 'connected' | 'disconnected' }) {
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const scores = crew?.organ_scores_6 ?? { cns: 91, cardio: 88, resp: 95, thermo: 94, metabolic: 76, musculo: 82 };
  const vitals = crew?.vitals;
  const selectedScore = selectedZone ? scores[selectedZone] : 0;
  const selectedDetails = selectedZone ? zoneContent[selectedZone] : null;

  return <div className={styles.bodyMapLayout}>
    <div className={styles.bodyMapGrid}>
      <Panel eyebrow="BIO-MAP / EVA SUIT TELEMETRY" title="Crew health systems" action={<StatusBadge tone={connection === 'connected' ? 'green' : 'amber'} dot>{connection === 'connected' ? 'NASA-STD-3001 1 HZ LIVE' : 'AWAITING FEED'}</StatusBadge>} className={styles.scenePanel} bodyClassName={styles.sceneBody}>
        <div className={styles.sceneStage}>
          <div className={styles.sceneHudTop}><span>EMU · EXTRAVEHICULAR MOBILITY UNIT</span><span>DRAG TO ROTATE · SCROLL TO ZOOM</span></div>
          <div className={styles.sceneViewport}>
            <SuitScene
              scores={scores}
              heartRate={vitals?.hr ?? 72}
              respiration={vitals?.resp ?? 14}
              selectedZone={selectedZone}
              onSelectZone={setSelectedZone}
              reducedMotion={reducedMotion}
            />
          </div>
          <div className={styles.sceneHudBottom}><span>NASA EMU / PUBLIC DOMAIN MODEL</span><button type="button" onClick={() => setSelectedZone(null)}>RESET VIEW <span aria-hidden="true">↺</span></button></div>
          <AnimatePresence>
            {selectedZone && selectedDetails && <motion.aside
              key={selectedZone}
              className={styles.organCard}
              initial={reducedMotion ? false : { opacity: 0, x: 22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? undefined : { opacity: 0, x: 16 }}
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }}
              aria-labelledby="organ-card-title"
            >
              <div className={styles.organCardHead}>
                <div><span className={styles.kicker}>ZONE {bodyZones.find(zone => zone.id === selectedZone)?.code}</span><h3 id="organ-card-title">{selectedDetails.title}</h3></div>
                <button className={styles.closeButton} type="button" aria-label="Close system detail" onClick={() => setSelectedZone(null)}>×</button>
              </div>
              <div className={styles.organScore}>
                <div><span>ORGAN INDEX</span><strong>{selectedScore}<small> / 100</small></strong></div>
                <StatusBadge tone={selectedScore >= 80 ? 'green' : selectedScore >= 60 ? 'amber' : 'red'} dot>{selectedScore >= 80 ? 'NOMINAL' : selectedScore >= 60 ? 'CAUTION' : 'CRITICAL'}</StatusBadge>
              </div>
              <section className={styles.organSection}>
                <h4>BIOLOGICAL FUNCTION</h4>
                <p>{selectedDetails.function}</p>
              </section>
              <section className={styles.organSection}>
                <h4>HOW IT IS MEASURED IN SPACE</h4>
                <p style={{ marginBottom: '8px', color: '#c5d3e2' }}>{selectedDetails.how_measured}</p>
                <div className={styles.readoutGrid}>
                  {getZoneReadouts(selectedZone, crew).map(readout => (
                    <div className={styles.readout} key={readout.label}>
                      <span>{readout.label}</span>
                      <strong>{readout.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className={styles.organSection}>
                <h4>SPACE HAZARD & CLINICAL DANGER</h4>
                <p style={{ lineHeight: 1.6 }}>{selectedDetails.space_hazard_danger}</p>
              </section>
              <section className={styles.organSection}>
                <h4>MISSION HAZARDS / 5</h4>
                <div className={styles.hazardList}>
                  {selectedDetails.hazards.map((hazard, index) => (
                    <span key={hazard}>
                      <i>{String(index + 1).padStart(2, '0')}</i>
                      {hazard}
                    </span>
                  ))}
                </div>
              </section>
            </motion.aside>}
          </AnimatePresence>
        </div>
      </Panel>
      <Panel eyebrow="SYSTEM INDEX / 0—100" title="Organ health" action={<StatusBadge tone="neutral">CREW {crew?.crew ?? 'A'}</StatusBadge>}>
        <div className={styles.systemList}>
          {bodyZones.map(zone => {
            const score = scores[zone.id];
            const tone = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
            return <button className={`${styles.systemRow} ${selectedZone === zone.id ? styles.systemRowSelected : ''}`} key={zone.id} type="button" onClick={() => setSelectedZone(selectedZone === zone.id ? null : zone.id)} aria-pressed={selectedZone === zone.id}>
              <span className={styles.systemCode}>{zone.code}</span>
              <span className={styles.systemInfo}><span className={styles.systemName}>{zoneTitles[zone.id]}<StatusBadge tone={tone}>{tone === 'green' ? 'NOMINAL' : tone === 'amber' ? 'CAUTION' : 'CRITICAL'}</StatusBadge></span><span className={styles.systemBar}><SegmentBar value={score} tone={tone} label={`${zoneTitles[zone.id]} index`} /></span></span>
              <strong className={styles.systemValue}>{score}</strong>
            </button>;
          })}
        </div>
        <div className={styles.systemLegend}><span><i className={styles.legendGreen} />80–100 NOMINAL</span><span><i className={styles.legendAmber} />60–79 CAUTION</span><span><i className={styles.legendRed} />0–59 CRITICAL</span></div>
        <div className={styles.miniReadouts}><div><span>HEART RATE</span><strong>{vitals ? `${vitals.hr} BPM` : '—'}</strong></div><div><span>O₂ SATURATION</span><strong>{vitals ? `${vitals.spo2.toFixed(1)}%` : '—'}</strong></div><div><span>CORE TEMP</span><strong>{vitals ? `${vitals.temp.toFixed(1)} °C` : '—'}</strong></div></div>
      </Panel>
    </div>
    <div className={styles.modelNote}><span className={styles.modelNoteMark} />Rotatable 3D suit model · health-system volumes are telemetry overlays · all readings simulated</div>
  </div>;
}

function getZoneReadouts(zone: ZoneId, crew: CrewState | null) {
  const vitals = crew?.vitals;
  if (!vitals) return [{ label: 'SENSOR LINK', value: 'WAITING FOR CREW FEED' }];
  switch (zone) {
    case 'cns':
      return [{ label: 'HEART RATE', value: `${vitals.hr} bpm` }, { label: 'RESPIRATORY RATE', value: `${vitals.resp} /min` }, { label: 'DIZZINESS FLAG', value: vitals.dizzy ? 'PRESENT' : 'CLEAR' }];
    case 'cardio':
      return [{ label: 'HEART RATE', value: `${vitals.hr} bpm` }, { label: 'BLOOD PRESSURE', value: `${vitals.sys}/${vitals.dia} mmHg` }, { label: 'ST TREND', value: `${vitals.st.toFixed(2)} mV` }];
    case 'resp':
      return [{ label: 'SpO₂', value: `${vitals.spo2.toFixed(1)}%` }, { label: 'RESPIRATORY RATE', value: `${vitals.resp} /min` }, { label: 'O₂ RESERVE', value: `${crew?.model_b.o2_left_pct.toFixed(1) ?? '—'}%` }];
    case 'thermo':
      return [{ label: 'CORE TEMPERATURE', value: `${vitals.temp.toFixed(1)} °C` }, { label: 'RADIATION DOSIMETER', value: 'NOT IN SENSOR PACKET' }, { label: 'THERMAL LOOP', value: 'SIMULATED' }];
    case 'metabolic':
      return [{ label: 'BLOOD SUGAR', value: `${vitals.blood_sugar_mgdl} mg/dL` }, { label: 'METABOLIC LOAD', value: `${crew?.model_b.metabolic_w ?? '—'} W` }, { label: 'HYDRATION', value: 'NOT IN SENSOR PACKET' }];
    case 'musculo':
      return [{ label: 'CALF SmO₂', value: `${vitals.smo2}%` }, { label: 'sEMG MDF', value: `${vitals.emg_mdf} Hz` }, { label: 'GAIT WOBBLE', value: `${vitals.gait}` }, { label: 'FATIGUE INDEX', value: `${crew?.model_a.fatigue_score ?? '—'} / 100` }];
  }
}
