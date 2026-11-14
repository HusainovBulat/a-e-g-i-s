'use client';

import { useEffect, useState } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import type { RoutePoint } from '../../../lib/api/types';
import { hasFall } from '../../../lib/crew';
import { clamp, formatMinutes, pushHistory, type Tone } from '../../../lib/status';
import { ElevationProfile } from '../charts/Charts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/icons';
import { Metric } from '../ui/Metric';
import { VisorHud } from '../visor/VisorHud';
import { visorModel } from '../../../lib/visor';
import { ProgressBar, StatusPill } from '../ui/StatusPill';
import styles from './mode1.module.css';

const ROUTE_LENGTH_M = 4950;

export function Mode1Screen() {
  const { frame, currentCrew, crew, api } = useConsole();
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [smo2History, setSmo2History] = useState<number[]>([]);
  const [o2History, setO2History] = useState<number[]>([]);
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const vitals = currentCrew?.vitals;
  const modelA = currentCrew?.model_a;
  const modelB = currentCrew?.model_b;

  useEffect(() => { void api.getRouteProfile().then(setRoute).catch(() => {}); }, [api]);
  useEffect(() => { setSmo2History([]); setO2History([]); }, [crew]);
  useEffect(() => {
    if (!vitals) return;
    setSmo2History(h => pushHistory(h, vitals.smo2));
    setO2History(h => pushHistory(h, modelB?.o2_burn_l_min));
  }, [vitals, modelB?.o2_burn_l_min]);

  if (!vitals || !modelA || !modelB) return <p className={styles.waiting}>Waiting for crew telemetry…</p>;

  const fall = hasFall(currentCrew);
  const walkBack = modelB.walk_back_min;
  const marginTone: Tone = fall || walkBack < 15 ? 'red' : walkBack < 30 ? 'amber' : 'green';
  const legsFail = modelA.legs_fail_min;
  const fatigue = Math.round(modelA.fatigue_score);
  const fatigueTone: Tone = fatigue >= 70 || (legsFail !== null && legsFail <= 15) ? 'red' : fatigue >= 50 ? 'amber' : 'green';
  const o2Tone: Tone = modelB.o2_left_pct < 25 ? 'red' : modelB.o2_left_pct < 50 ? 'amber' : 'green';
  const warning = fatigueTone === 'red';

  // Same order the helmet HUD shows (lib/visor.ts), so console and visor never disagree.
  const visor = visorModel(frame, crew);
  const command = visor.command.text;

  const distance = modelB.distance_m ?? vitals.distance_m ?? 1850;
  const position = clamp(distance / ROUTE_LENGTH_M, 0.04, 0.9);
  const turnaround = clamp(position + (0.95 - position) * clamp(walkBack / 90, 0, 1), position, 0.95);
  const elevation = route.length ? route.map(p => p.elevation_m) : [];

  const sendToVisor = async () => {
    setSending(true);
    try {
      await api.postEvent({ type: 'visor_instruction', crew, text: `${formatMinutes(walkBack)} · ${command}` });
      setSent(`Sent at ${new Date().toISOString().slice(11, 19)} UTC`);
    } catch {
      setSent('Could not reach the base server');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.screen}>
      {warning && !fall && (
        <div className={styles.banner} role="alert">
          <Icon name="warning" size={22} />
          <p>
            <strong>{legsFail !== null ? `Legs predicted to fail in ${legsFail.toFixed(0)} min.` : `Leg fatigue ${fatigue}/100.`}</strong>{' '}
            This is the 15-minute early warning, before the suit CO₂ sensor would notice. Recommend a 60-second rest.
          </p>
          <Button variant="danger" icon="send" onClick={sendToVisor} disabled={sending}>Send rest order</Button>
        </div>
      )}

      <div className={styles.hero}>
        <Card className={styles.walkBack} tone={marginTone === 'green' ? undefined : marginTone}>
          <span className={styles.heroLabel}>Time left before turning back</span>
          <div className={`${styles.timer} num tone-${marginTone}`}>{fall ? '00:00' : formatMinutes(walkBack)}</div>
          <ProgressBar value={fall ? 0 : walkBack} max={60} tone={marginTone} label="Walk-back margin" />
          <p className={styles.heroNote}>
            {fall ? 'EVA aborted — crew member down.' : 'Point of no return: after this the remaining oxygen is not enough to walk back to base on this terrain.'}
          </p>
        </Card>

        <Card>
          <Metric
            size="lg"
            label="Leg muscle fatigue"
            value={fatigue}
            unit="/ 100"
            tone={fatigueTone}
            hint={<>
              {legsFail === null ? 'Not getting worse right now' : <>Legs fail in <b className={`num tone-${fatigueTone}`}>{legsFail.toFixed(0)} min</b> at this pace</>}
              {modelA.fallback ? ' · NIRS fogged, backup model' : ''}
            </>}
            history={smo2History}
          />
        </Card>

        <Card>
          <Metric
            size="lg"
            label="Suit oxygen left"
            value={modelB.o2_left_pct.toFixed(0)}
            unit="%"
            tone={o2Tone}
            hint={<>Burning <b className="num">{modelB.o2_burn_l_min.toFixed(2)}</b> L/min · {Math.round(modelB.metabolic_w)} W</>}
            history={o2History}
          />
        </Card>
      </div>

      <div className={styles.row}>
        <Card
          title="Route · Shackleton crater rim"
          subtitle="NASA LRO LOLA elevation, Site 04"
          action={<StatusPill tone="neutral" dot={false}>Slope {vitals.slope.toFixed(0)}°</StatusPill>}
          className={styles.routeCard}
        >
          {elevation.length > 1 ? <ElevationProfile values={elevation} position={position} turnaround={turnaround} /> : <p className={styles.waiting}>Loading route…</p>}
          <div className={styles.routeLegend}>
            <span><i className={styles.dotGreen} />You are here · {(distance / 1000).toFixed(2)} km</span>
            <span><i className={styles.dotAmber} />Turn-back point</span>
            <span><i className={styles.dotBlue} />Reachable with current O₂</span>
          </div>
        </Card>

        <Card title="Helmet visor" subtitle="What the astronaut sees: data on the edges, the view ahead stays clear">
          <div className={styles.visor}><VisorHud model={visor} /></div>
          <div className={styles.visorActions}>
            <Button variant="primary" icon="send" onClick={sendToVisor} disabled={sending}>Send to visor</Button>
            <a className={styles.link} href={`/v2/visor?crew=${crew}`} target="_blank" rel="noreferrer">Open full visor ↗</a>
          </div>
          {sent && <p className={styles.sent}>{sent}</p>}
        </Card>
      </div>

    </div>
  );
}
