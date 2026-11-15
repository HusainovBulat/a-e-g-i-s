'use client';

import { useEffect, useState } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import { normalizeEnvId } from '../../../lib/api/client';
import type { RoutePoint } from '../../../lib/api/types';
import { hasFall } from '../../../lib/crew';
import { clamp, formatMinutes, pushHistory, type Tone } from '../../../lib/status';
import { visorModel } from '../../../lib/visor';
import { ElevationProfile, Sparkline } from '../charts/Charts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/icons';
import { Metric } from '../ui/Metric';
import { ProgressBar, StatusPill } from '../ui/StatusPill';
import { VisorHud } from '../visor/VisorHud';
import styles from './mode1.module.css';

const ROUTE_LENGTH_M = 4950;

export function Mode1Screen() {
  const { currentCrew, crew, api, frame } = useConsole();
  const vitals = currentCrew?.vitals;
  const modelA = currentCrew?.model_a;
  const modelB = currentCrew?.model_b;

  const [smo2History, setSmo2History] = useState<number[]>([]);
  const [o2History, setO2History] = useState<number[]>([]);
  const [route, setRoute] = useState<RoutePoint[]>([]);

  useEffect(() => {
    void api.getRouteProfile().then(setRoute).catch(() => {});
  }, [api]);

  useEffect(() => { setSmo2History([]); setO2History([]); }, [crew]);
  useEffect(() => {
    if (!vitals) return;
    setSmo2History(h => pushHistory(h, vitals.smo2));
    setO2History(h => pushHistory(h, modelB?.o2_burn_l_min));
  }, [vitals, modelB?.o2_burn_l_min]);

  if (!vitals || !modelA || !modelB) return <p className={styles.waiting}>Waiting for crew telemetry…</p>;

  const env = normalizeEnvId(vitals.env);
  const isCrater = env === 'crater_eva';
  const isRover = env === 'rover';
  const isLunarBase = env === 'moon_base';
  const isMarsTransit = env === 'mars_transit';
  const isOrbit = env === 'orbit_station';
  const isOutside = isCrater || isRover;

  const fall = hasFall(currentCrew);
  const rawWalkBack = modelB.walk_back_min;
  const walkBack = (rawWalkBack && rawWalkBack > 0)
    ? rawWalkBack
    : (isOutside ? 105.8 : 0);

  const marginTone: Tone = !isOutside
    ? 'green'
    : (fall || walkBack < 15 ? 'red' : walkBack < 30 ? 'amber' : 'green');

  const legsFail = modelA.legs_fail_min;
  const fatigue = Math.round(modelA.fatigue_score);
  const fatigueTone: Tone = fatigue >= 70 || (legsFail !== null && legsFail <= 15) ? 'red' : fatigue >= 50 ? 'amber' : 'green';
  const o2Tone: Tone = modelB.o2_left_pct < 25 ? 'red' : modelB.o2_left_pct < 50 ? 'amber' : 'green';
  const warning = fatigueTone === 'red';

  // Helmet HUD model derived from live console frame
  const visor = visorModel(frame, crew);

  const distance = modelB.distance_m ?? vitals.distance_m ?? 1850;
  const position = clamp(distance / ROUTE_LENGTH_M, 0.04, 0.9);
  const turnaround = clamp(position + (0.95 - position) * clamp(walkBack / 90, 0, 1), position, 0.95);
  const elevation = route.length ? route.map(p => p.elevation_m) : [];

  return (
    <div className={styles.screen}>
      {warning && !fall && (
        <div className={styles.banner} role="alert">
          <Icon name="warning" size={22} />
          <p>
            <strong>{legsFail !== null ? `Legs predicted to fail in ${legsFail.toFixed(0)} min.` : `Leg fatigue ${fatigue}/100.`}</strong>{' '}
            This is the 15-minute early warning, before the suit CO₂ sensor would notice. Recommend a 60-second rest.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" icon="scan" onClick={() => window.open(`/v2/visor?crew=${crew}`, '_blank')}>
              Open visor HUD ↗
            </Button>
          </div>
        </div>
      )}

      <div className={styles.hero}>
        <Card className={styles.walkBack} tone={marginTone === 'green' ? undefined : marginTone}>
          <span className={styles.heroLabel}>
            {isOutside ? 'Time left before turning back' : 'Cabin life support environment'}
          </span>
          <div className={`${styles.timer} num tone-${marginTone}`}>
            {fall
              ? '00:00'
              : isOutside
              ? formatMinutes(walkBack)
              : isLunarBase
              ? 'IN HABITAT'
              : isMarsTransit
              ? 'IN TRANSIT'
              : 'IN ORBIT'
            }
          </div>
          <ProgressBar value={fall ? 0 : isOutside ? walkBack : 60} max={60} tone={marginTone} label="Walk-back margin" />
          <p className={styles.heroNote}>
            {fall
              ? 'EVA aborted — crew member down.'
              : isCrater
              ? '🚶 CRATER EVA (0.16g) — Dynamic on-foot walk-back limit based on slope, PLSS O2 burn rate, and muscle fatigue.'
              : isRover
              ? '🛞 ROVER (0.16g) — ROVER TRAVERSE: Tracking emergency on-foot walk-back limit to base in case of rover mechanical failure.'
              : isLunarBase
              ? '🏠 INSIDE LUNAR BASE (SHIRT-SLEEVE): Crew is inside pressurized habitat. Walk-Back Limit in standby; monitoring cabin O2/CO2 & recovery.'
              : isMarsTransit
              ? '🚀 DEEP SPACE TRANSIT (0g): Inside spacecraft cabin. Walk-Back Limit in standby; monitoring 0g deconditioning, radiation & comm delay.'
              : '🛰️ ORBITAL STATION (0g): Inside station module. Walk-Back Limit in standby; monitoring microgravity exercise load & cabin air.'
            }
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
            label="Oxygen burn rate"
            value={modelB.o2_burn_l_min.toFixed(2)}
            unit="L/min"
            tone={o2Tone}
            hint={<>{modelB.metabolic_w.toFixed(0)} W metabolic load · {modelB.o2_left_pct.toFixed(0)}% remaining in tank</>}
            history={o2History}
          />
        </Card>
      </div>

      <div className={styles.row}>
        <Card
          title="Shackleton crater traverse"
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
            <a className={styles.link} href={`/v2/visor?crew=${crew}`} target="_blank" rel="noreferrer">Open full visor ↗</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
