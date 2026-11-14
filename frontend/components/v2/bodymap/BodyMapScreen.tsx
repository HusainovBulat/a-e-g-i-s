'use client';

import { useState } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import type { CrewState, ZoneId } from '../../../lib/api/types';
import { bandLabel, scoreTone } from '../../../lib/status';
import { zoneContent } from '../../../server/mock/content';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Controls';
import { ProgressBar, StatusPill } from '../ui/StatusPill';
import { BodyFigure } from './BodyFigure';
import { bodyZones, zoneTitles } from './zones';
import styles from './BodyMap.module.css';

export function BodyMapScreen() {
  const { currentCrew } = useConsole();
  const [selected, setSelected] = useState<ZoneId | null>(null);
  const vitals = currentCrew?.vitals;
  const scores = currentCrew?.organ_scores_6;

  if (!scores || !vitals) return <p className={styles.waiting}>Waiting for crew telemetry…</p>;

  const details = selected ? zoneContent[selected] : null;
  const selectedScore = selected ? Math.round(scores[selected]) : 0;
  const ordered = [...bodyZones].sort((a, b) => scores[a.id] - scores[b.id]);

  return (
    <div className={styles.layout}>
      <Card title="Body map" subtitle="Six systems scored 0–100 from live sensors. Select one for details." bodyClassName={styles.merged}>
        <div className={styles.figureCol}>
          <BodyFigure scores={scores} selected={selected} onSelect={setSelected} />
          <div className={styles.legend}>
            <span><i className={styles.dotGreen} />80–100 nominal</span>
            <span><i className={styles.dotAmber} />60–79 caution</span>
            <span><i className={styles.dotRed} />below 60 critical</span>
          </div>
        </div>

        <div className={styles.systemsCol}>
          <h3 className={styles.colTitle}>Systems · lowest score first</h3>
          <ul className={styles.systemList}>
            {ordered.map(zone => {
              const score = Math.round(scores[zone.id]);
              const tone = scoreTone(score);
              return (
                <li key={zone.id}>
                  <button type="button" className={styles.systemRow} onClick={() => setSelected(zone.id)}>
                    <span className={styles.systemName}>{zone.title}</span>
                    <StatusPill tone={tone}>{bandLabel[tone]}</StatusPill>
                    <strong className={`num tone-${tone}`}>{score}</strong>
                    <span className={styles.systemBar}><ProgressBar value={score} tone={tone} label={`${zone.title} score`} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Modal open={Boolean(selected && details)} onClose={() => setSelected(null)} title={selected ? zoneTitles[selected] : ''} subtitle={details?.title} wide>
        {selected && details && (
          <div className={styles.detail}>
            <div className={styles.detailScore}>
              <strong className={`num tone-${scoreTone(selectedScore)}`}>{selectedScore}<small>/ 100</small></strong>
              <StatusPill tone={scoreTone(selectedScore)}>{bandLabel[scoreTone(selectedScore)]}</StatusPill>
            </div>
            <div className={styles.readouts}>
              {zoneReadouts(selected, currentCrew).map(r => (
                <div key={r.label}><span>{r.label}</span><strong className="num">{r.value}</strong></div>
              ))}
            </div>
            <section>
              <h4>What it does</h4>
              <p>{details.function}</p>
            </section>
            <section>
              <h4>How we measure it in space</h4>
              <p>{details.how_measured}</p>
            </section>
            <section className={styles.hazard}>
              <h4>Why it is at risk in space</h4>
              <p>{details.nasa_threat}</p>
              <ul>{details.hazards.map(h => <li key={h}>{h}</li>)}</ul>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}

function zoneReadouts(zone: ZoneId, crew: CrewState | null): Array<{ label: string; value: string }> {
  const v = crew?.vitals;
  if (!v || !crew) return [];
  switch (zone) {
    case 'cns': return [{ label: 'Heart rate', value: `${Math.round(v.hr)} bpm` }, { label: 'Dizziness', value: v.dizzy ? 'Reported' : 'None' }, { label: 'Gait wobble', value: v.gait.toFixed(2) }];
    case 'cardio': return [{ label: 'Heart rate', value: `${Math.round(v.hr)} bpm` }, { label: 'Blood pressure', value: `${Math.round(v.sys)}/${Math.round(v.dia)}` }, { label: 'ST segment', value: `${v.st.toFixed(2)} mV` }];
    case 'resp': return [{ label: 'SpO₂', value: `${v.spo2.toFixed(1)} %` }, { label: 'Breathing', value: `${Math.round(v.resp)} / min` }, { label: 'Suit O₂ left', value: `${crew.model_b.o2_left_pct.toFixed(0)} %` }];
    case 'thermo': return [{ label: 'Core temperature', value: `${v.temp.toFixed(1)} °C` }];
    case 'metabolic': return [{ label: 'Blood sugar', value: `${Math.round(v.blood_sugar_mgdl)} mg/dL` }, { label: 'Metabolic load', value: `${Math.round(crew.model_b.metabolic_w)} W` }];
    case 'musculo': return [{ label: 'Calf SmO₂', value: `${v.smo2.toFixed(0)} %` }, { label: 'Leg fatigue', value: `${Math.round(crew.model_a.fatigue_score)} / 100` }, { label: 'Gait wobble', value: v.gait.toFixed(2) }];
  }
}
