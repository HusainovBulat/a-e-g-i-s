'use client';

import React, { useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { ElevationProfile, TrendAreaChart } from '../charts/Charts';
import { Icon } from '../ui/icons';
import { useConsole } from '../../lib/ConsoleProvider';
import { normalizeEnvId } from '../../lib/api/client';
import { crewMeta, envTitle } from '../../lib/crew';
import { visorModel } from '../../lib/visor';
import { VisorHud } from '../v2/visor/VisorHud';
import type { RoutePoint } from '../../lib/api/types';
import styles from './mode1.module.css';

export function Mode1Screen() {
  const { currentCrew, crew, frame } = useConsole();
  const [showVisorPopup, setShowVisorPopup] = useState<boolean>(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);

  const vitals = currentCrew?.vitals;
  const modelA = currentCrew?.model_a;
  const modelB = currentCrew?.model_b;
  const env = normalizeEnvId(vitals?.env ?? 'crater_eva');

  const [smo2History, setSmo2History] = useState<number[]>([78, 77.5, 78, 78.2, 78, 77.8, 78.1]);
  const [o2BurnHistory, setO2BurnHistory] = useState<number[]>([1.35, 1.4, 1.42, 1.45, 1.44, 1.46, 1.45]);

  useEffect(() => {
    if (vitals?.smo2 !== undefined) {
      const hrvWave = Math.sin(Date.now() / 2000) * 0.25;
      setSmo2History(prev => [...prev.slice(-24), Number((vitals.smo2 + hrvWave).toFixed(1))]);
    }
  }, [vitals?.t, vitals?.smo2]);

  useEffect(() => {
    if (modelB?.o2_burn_l_min !== undefined) {
      const wave = Math.sin(Date.now() / 1600) * 0.02;
      setO2BurnHistory(prev => [...prev.slice(-24), Number((modelB.o2_burn_l_min + wave).toFixed(2))]);
    }
  }, [vitals?.t, modelB?.o2_burn_l_min]);

  useEffect(() => {
    fetch('/api/route_profile')
      .then(res => (res.ok ? res.json() : []))
      .then(data => setRoutePoints(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Environment Classification
  const isCrater = env === 'crater_eva';
  const isRover = env === 'rover';
  const isLunarBase = env === 'moon_base';
  const isMarsTransit = env === 'mars_transit';
  const isOrbit = env === 'orbit_station';
  const isOutside = isCrater || isRover;

  const isFall = Boolean(vitals?.fall);

  // Defaults if loading / rover duplication
  const serverWalkBack = modelB?.walk_back_min;
  const rawWalkBackMin = isFall
    ? 0
    : (serverWalkBack !== undefined && serverWalkBack !== null && serverWalkBack > 0)
    ? serverWalkBack
    : (isOutside ? 105.8 : 0);
  const walkBackMin = isFall ? 0 : Math.max(0, rawWalkBackMin);
  const isCriticalWalkBack = isOutside && !isFall && walkBackMin < 15;

  const distanceM = (currentCrew?.model_b?.distance_m && currentCrew.model_b.distance_m > 0)
    ? currentCrew.model_b.distance_m
    : (vitals?.distance_m && vitals.distance_m > 0 ? vitals.distance_m : 1850);
  const returnSpeedKmh = Math.max(1.2, 2.5 * (1.0 - 0.3 * ((modelA?.fatigue_score ?? 42) / 100)));
  const returnTimeMin = currentCrew?.model_b?.return_time_min ?? (distanceM / (returnSpeedKmh * 1000 / 60));
  const o2LeftPct = modelB?.o2_left_pct ?? 78.4;
  const o2Burn = modelB?.o2_burn_l_min ?? 1.45;
  const metabolicW = modelB?.metabolic_w ?? 265;
  const fatigueScore = modelA?.fatigue_score ?? 42;
  const legsFailMin = modelA ? modelA.legs_fail_min : null;
  const legsFailText = legsFailMin === null ? 'STABLE' : `${legsFailMin.toFixed(1)} MIN`;
  const isFallback = modelA?.fallback ?? false;
  const isDizzy = vitals?.dizzy ?? false;

  const currentSmo2 = vitals?.smo2 ?? (smo2History[smo2History.length - 1] ?? 78.0);
  const smo2Tone: 'green' | 'amber' | 'red' = currentSmo2 < 60 ? 'red' : currentSmo2 < 72 ? 'amber' : 'green';
  const o2BurnTone: 'green' | 'amber' | 'red' = o2Burn > 2.0 ? 'red' : o2Burn > 1.65 ? 'amber' : 'green';

  const isWarningFatigue = (legsFailMin !== null && legsFailMin <= 15) || fatigueScore >= 70;

  // Format elevation points for SVG profile
  const elevationArray = routePoints.length > 0
    ? routePoints.map(p => p.elevation_m)
    : [12, 14, 17, 15, 20, 23, 21, 28, 26, 30, 34, 31, 39, 43, 41, 47, 45, 54, 51, 60, 58, 64, 69, 66, 75, 79, 73, 82, 88, 85, 94, 90, 98];

  // Dynamic helmet visor model from live console frame
  const visor = visorModel(frame, crew);

  return (
    <div className={styles.screen}>
      {/* Early Warning Banner with Visor button */}
      {isWarningFatigue && (
        <div className={styles.warningBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/images/4_2_micro_rest_crater.png"
              alt="60s Crater Micro-Recovery Pose"
              className={styles.restPoseThumb}
              title="60-second micro-recovery posture"
            />
            <Icon name="warning" size={20} style={{ color: 'var(--red)' }} />
            <div className={styles.warningText}>
              <strong>15-MINUTE EARLY WARNING // MODEL A:</strong>{' '}
              {legsFailMin !== null ? (
                <>Muscle failure predicted in <strong>{legsFailText}</strong> before suit CO₂ spikes.</>
              ) : (
                <>Severe muscle exhaustion detected (<strong>{fatigueScore} / 100</strong>) with plateaued recovery.</>
              )}{' '}
              Recommendation: Halt for 60s micro-recovery.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowVisorPopup(true)}>
              <Icon name="scan" size={14} />
              OPEN VISOR HUD ↗
            </Button>
          </div>
        </div>
      )}

      {/* Top Row: Walk-Back Hero & Model A */}
      <div className={styles.topRow}>
        {/* Walk-Back Limit (Model B) */}
        <Panel
          eyebrow={isOutside ? 'MODEL B // POINT OF NO RETURN' : 'ENVIRONMENT // LIFE SUPPORT MONITOR'}
          title={isOutside ? 'Dynamic walk-back limit' : 'Cabin atmospheric monitor'}
          action={
            isFall ? (
              <StatusBadge tone="red" dot>CREW DOWN</StatusBadge>
            ) : isCrater || isRover ? (
              <StatusBadge tone={isCriticalWalkBack ? 'red' : walkBackMin < 30 ? 'amber' : 'green'} dot>
                {isCriticalWalkBack ? 'TURN BACK NOW' : walkBackMin < 30 ? 'SLOW DOWN' : 'SAFE TO PROCEED'}
              </StatusBadge>
            ) : (
              <StatusBadge tone="green" dot>
                STANDBY
              </StatusBadge>
            )
          }
        >
          <div className={styles.walkBackHero}>
            <div className={styles.timerDisplay}>
              {isFall ? (
                <>
                  <div className={styles.timerNumber} style={{ color: 'var(--red)' }}>
                    00:00
                  </div>
                  <span className={styles.timerUnit} style={{ color: 'var(--red)', fontWeight: 700 }}>
                    EVA ABORTED // CREW DOWN · RESCUE IN PROGRESS
                  </span>
                </>
              ) : isCrater ? (
                <>
                  <div
                    className={styles.timerNumber}
                    style={{ color: isCriticalWalkBack ? 'var(--red)' : walkBackMin < 30 ? 'var(--amber)' : 'var(--green)' }}
                  >
                    {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                    {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')}
                  </div>
                  <span className={styles.timerUnit}>MINUTES REMAINING BEFORE POINT OF NO RETURN</span>
                </>
              ) : isRover ? (
                <>
                  <div
                    className={styles.timerNumber}
                    style={{ color: isCriticalWalkBack ? 'var(--red)' : walkBackMin < 30 ? 'var(--amber)' : 'var(--green)' }}
                  >
                    {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                    {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')}
                  </div>
                  <span className={styles.timerUnit}>MINUTES REMAINING BEFORE POINT OF NO RETURN</span>
                </>
              ) : isLunarBase ? (
                <>
                  <div className={styles.timerNumber} style={{ color: 'var(--green)', fontSize: '42px' }}>
                    IN HABITAT
                  </div>
                  <span className={styles.timerUnit}>SHIRT-SLEEVE ENVIRONMENT · CABIN O₂ / CO₂ REGULATED</span>
                </>
              ) : isMarsTransit ? (
                <>
                  <div className={styles.timerNumber} style={{ color: 'var(--blue-bright)', fontSize: '42px' }}>
                    IN TRANSIT
                  </div>
                  <span className={styles.timerUnit}>INTERPLANETARY SPACECRAFT CABIN · 0G ENVIRONMENT</span>
                </>
              ) : (
                <>
                  <div className={styles.timerNumber} style={{ color: 'var(--blue-bright)', fontSize: '42px' }}>
                    IN ORBIT
                  </div>
                  <span className={styles.timerUnit}>ORBITAL STATION MODULE · 0G CLOSED-LOOP ECLSS</span>
                </>
              )}
            </div>

            <div className={styles.timerBar}>
              <div
                className={styles.timerBarFill}
                style={{
                  width: isOutside
                    ? `${Math.min(100, (walkBackMin / 90) * 100)}%`
                    : '100%',
                  backgroundColor: isOutside
                    ? (isCriticalWalkBack ? 'var(--red)' : walkBackMin < 30 ? 'var(--amber)' : 'var(--green)')
                    : 'var(--green)',
                }}
              />
            </div>

            <div className={styles.timerMeta}>
              <span>METABOLIC EXPENDITURE: {metabolicW} W</span>
              <span>O₂ BURN RATE: {o2Burn.toFixed(2)} L/MIN</span>
              <span>{isOutside ? `PLSS RESERVE: ${o2LeftPct.toFixed(1)}%` : `CABIN O₂: ${o2LeftPct.toFixed(1)}%`}</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 12px',
              marginTop: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--line-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}>
              {isCrater && (
                <>
                  <span>🚶 <strong>RETURN TREK ON FOOT:</strong> ~{Math.round(returnTimeMin)} MIN ({(distanceM / 1000).toFixed(2)} KM @ {returnSpeedKmh.toFixed(1)} KM/H)</span>
                  <span style={{ color: 'var(--blue-bright)', letterSpacing: '0.05em' }}>NASA APOLLO / ARTEMIS CONSTRAINT</span>
                </>
              )}
              {isRover && (
                <>
                  <span>🛞 <strong>ROVER EGRESS ON FOOT:</strong> ~{Math.round(returnTimeMin)} MIN ({(distanceM / 1000).toFixed(2)} KM @ {returnSpeedKmh.toFixed(1)} KM/H)</span>
                  <span style={{ color: 'var(--blue-bright)', letterSpacing: '0.05em' }}>NASA ROVER WALKBACK CONSTRAINT</span>
                </>
              )}
              {isLunarBase && (
                <>
                  <span>🏠 <strong>LUNAR BASE ECLSS ACTIVE:</strong> CENTRAL LIFE SUPPORT NOMINAL · REGENERATIVE O₂ LOOP</span>
                  <span style={{ color: 'var(--green)', letterSpacing: '0.05em' }}>ZERO PLSS EXPENDITURE</span>
                </>
              )}
              {isMarsTransit && (
                <>
                  <span>🚀 <strong>SPACECRAFT LIFE SUPPORT:</strong> 0G DEEP SPACE TRANSIT · SOLAR PARTICLE SHIELDING NOMINAL</span>
                  <span style={{ color: 'var(--blue-bright)', letterSpacing: '0.05em' }}>EARTH-MARS COMM DELAY ACTIVE</span>
                </>
              )}
              {isOrbit && (
                <>
                  <span>🛰️ <strong>ORBITAL STATION MODULE:</strong> CLOSED-LOOP RECIRCULATION · MICROGRAVITY WORKOUT PROTOCOL</span>
                  <span style={{ color: 'var(--blue-bright)', letterSpacing: '0.05em' }}>0G CARDIO MONITORED</span>
                </>
              )}
            </div>

            {/* Plain-English explanation box with exact requested texts */}
            <div
              style={{
                padding: '9px 12px',
                background: isCriticalWalkBack
                  ? 'rgba(239, 68, 68, 0.12)'
                  : (isOutside && walkBackMin < 30)
                  ? 'rgba(245, 179, 1, 0.12)'
                  : 'rgba(46, 204, 113, 0.12)',
                border: `1px solid ${
                  isCriticalWalkBack
                    ? 'var(--red)'
                    : (isOutside && walkBackMin < 30)
                    ? 'var(--amber)'
                    : 'var(--green)'
                }`,
                fontSize: '11px',
                lineHeight: 1.45,
                color: isCriticalWalkBack
                  ? '#fca5a5'
                  : (isOutside && walkBackMin < 30)
                  ? '#fde68a'
                  : '#a7f3d0',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {isCrater && (
                <span>
                  🚶 <strong>CRATER EVA (0.16g)</strong> — Dynamic on-foot walk-back limit based on slope, PLSS O₂ burn rate, and muscle fatigue.
                </span>
              )}
              {isRover && (
                <span>
                  🛞 <strong>ROVER (0.16g)</strong> — ROVER TRAVERSE: Tracking emergency on-foot walk-back limit to base in case of rover mechanical failure.
                </span>
              )}
              {isLunarBase && (
                <span>
                  🏠 <strong>INSIDE LUNAR BASE (SHIRT-SLEEVE):</strong> Crew is inside pressurized habitat. Walk-Back Limit in standby; monitoring cabin O2/CO2 & recovery.
                </span>
              )}
              {isMarsTransit && (
                <span>
                  🚀 <strong>DEEP SPACE TRANSIT (0g):</strong> Inside spacecraft cabin. Walk-Back Limit in standby; monitoring 0g deconditioning, radiation & comm delay.
                </span>
              )}
              {isOrbit && (
                <span>
                  🛰️ <strong>ORBITAL STATION (0g):</strong> Inside station module. Walk-Back Limit in standby; monitoring microgravity exercise load & cabin air.
                </span>
              )}
            </div>
          </div>
        </Panel>

        {/* Model A: Leg Muscle Fatigue */}
        <Panel
          eyebrow="MODEL A // MUSCLE STAMINA"
          title="Leg fatigue & failure forecast"
          action={
            <StatusBadge tone={isFallback ? 'amber' : 'blue'} dot>
              {isFallback ? 'FALLBACK (NIRS FOGGED)' : 'PRIMARY (NIRS + sEMG)'}
            </StatusBadge>
          }
        >
          <div className={styles.metricsGrid2}>
            <div className={styles.metricTile}>
              <span>FATIGUE SCORE</span>
              <strong style={{ color: fatigueScore >= 70 ? 'var(--red)' : fatigueScore >= 50 ? 'var(--amber)' : 'var(--green)' }}>
                {fatigueScore.toFixed(0)} <small>/ 100</small>
              </strong>
              <small>How tired your leg muscles are (0 = fresh, 100 = exhaustion)</small>
            </div>

            <div className={styles.metricTile}>
              <span>LEGS FAIL IN</span>
              <strong style={{ color: legsFailMin !== null && legsFailMin <= 15 ? 'var(--red)' : 'var(--text-strong)' }}>
                {legsFailText}
              </strong>
              <small>Time left before severe calf cramps</small>
            </div>

            <div className={styles.metricTile}>
              <span>CALF SmO₂</span>
              <strong>{currentSmo2.toFixed(1)}%</strong>
              <small>Muscle Oxygen Reserve (Normal: &gt;60%)</small>
            </div>

            <div className={styles.metricTile}>
              <span>sEMG MDF SHIFT</span>
              <strong>{vitals?.emg_mdf ? `${vitals.emg_mdf.toFixed(1)}%` : '-2.4%'}</strong>
              <small>Muscle Fiber Fatigue Shift (Cramp Warning at -25%)</small>
            </div>
          </div>

          <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-subtle)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            STEP BALANCE / STUMBLE RISK: <strong style={{ color: '#fff' }}>Normal ({vitals?.gait ? vitals.gait.toFixed(2) : '0.22'} SD)</strong> · SPEED: {vitals?.speed ? vitals.speed.toFixed(1) : '2.5'} KM/H
          </div>
        </Panel>
      </div>

      {/* Live Helmet Visor HUD borrowed from V2 */}
      <Panel
        eyebrow="A.E.G.I.S. // HEADS-UP DISPLAY"
        title={`Spacesuit helmet visor · ${crewMeta[crew]?.name ?? `Crew ${crew}`}`}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowVisorPopup(true)}>
              <Icon name="scan" size={14} />
              OPEN FULL VISOR HUD ↗
            </Button>
            <a
              href={`/v2/visor?crew=${crew}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--blue-bright)',
                textDecoration: 'none',
                padding: '5px 8px',
                border: '1px solid var(--line-subtle)',
                borderRadius: '4px'
              }}
            >
              STANDALONE TAB ↗
            </a>
          </div>
        }
      >
        <div style={{
          aspectRatio: '16 / 9',
          width: '100%',
          maxHeight: '420px',
          overflow: 'hidden',
          borderRadius: '8px',
          border: '1px solid #1d3354',
          background: '#010204',
          position: 'relative',
          margin: '0 auto',
        }}>
          <VisorHud model={visor} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '10px'
        }}>
          <span>ENVIRONMENT SCENE: <strong style={{ color: '#fff' }}>{envTitle(env).toUpperCase()}</strong></span>
          <span>HEADS-UP TELEMETRY: <strong style={{ color: 'var(--green)' }}>EDGES ACTIVE · CLEAR CENTER</strong></span>
        </div>
      </Panel>

      {/* Route Elevation Profile (LRO LOLA Site04) */}
      <Panel
        eyebrow="LRO LOLA / SITE 04 SHACKLETON CRATER"
        title={isOutside ? 'Route topography & point of no return' : `Topography overview · ${envTitle(env)}`}
        action={<StatusBadge tone="blue">{isOutside ? 'MAP SCALE 5M/PX' : 'SURFACE REFERENCE'}</StatusBadge>}
      >
        {(() => {
          const distanceM = currentCrew?.model_b?.distance_m ?? (vitals?.distance_m ?? 1850);
          const totalRouteM = 4950;
          const currentPosRatio = Math.max(0.08, Math.min(0.88, distanceM / totalRouteM));
          const maxForwardMargin = 0.94 - currentPosRatio;
          const walkBackFactor = isOutside ? Math.max(0, Math.min(1, walkBackMin / 90)) : 1;
          const turnaroundRatio = Math.max(
            currentPosRatio,
            Math.min(0.95, currentPosRatio + Math.max(0.02, maxForwardMargin * walkBackFactor))
          );
          return <ElevationProfile values={elevationArray} position={currentPosRatio} turnaround={turnaroundRatio} />;
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          <span>LUNAR BASE (0 M)</span>
          <span>CRATER RIDGE (143 M)</span>
          <span>SLOPE: {vitals?.slope ? vitals.slope.toFixed(1) : '12.0'}°</span>
        </div>
      </Panel>

      {/* Live Trend Charts */}
      <Panel
        eyebrow="TELEMETRY STREAMS (1 HZ)"
        title="Predictive physiological trends"
        action={<StatusBadge tone="blue" dot>REAL-TIME</StatusBadge>}
      >
        <div className={styles.trendChartsGrid}>
          {/* Chart 1: Calf SmO2 */}
          <div className={styles.trendCard}>
            <div className={styles.trendCardHead}>
              <div>
                <span className={styles.trendLabel}>CALF SmO₂ DESATURATION (OPTICAL NIRS)</span>
                <div className={styles.trendValueWrap}>
                  <strong className={styles.trendValue}>
                    {currentSmo2.toFixed(1)} <small>%</small>
                  </strong>
                  <StatusBadge tone={smo2Tone} dot>
                    {smo2Tone === 'red' ? 'CRITICAL DESAT' : smo2Tone === 'amber' ? 'CAUTION' : 'NOMINAL'}
                  </StatusBadge>
                </div>
              </div>
              <div className={styles.trendDelta}>
                <span>RANGE: 40—100%</span>
                <span style={{ color: smo2Tone === 'red' ? 'var(--red)' : smo2Tone === 'amber' ? 'var(--amber)' : 'var(--green)' }}>
                  {currentSmo2 >= 70 ? 'TISSUE OXYGENATED' : 'HYPOXIC CASCADE'}
                </span>
              </div>
            </div>
            <div className={styles.trendChartWrap}>
              <TrendAreaChart
                values={smo2History}
                color={smo2Tone === 'red' ? 'var(--red)' : smo2Tone === 'amber' ? 'var(--amber)' : 'var(--blue-bright)'}
                gradientId="grad-smo2"
                label="Calf SmO2 tissue oxygenation trend"
                height={68}
              />
            </div>
            <div className={styles.trendFooter}>
              <span>T - 24S</span>
              <span>1 HZ OPTICAL SENSOR STREAM</span>
              <span>LIVE</span>
            </div>
          </div>

          {/* Chart 2: Metabolic O2 */}
          <div className={styles.trendCard}>
            <div className={styles.trendCardHead}>
              <div>
                <span className={styles.trendLabel}>METABOLIC O₂ CONSUMPTION (MODEL B)</span>
                <div className={styles.trendValueWrap}>
                  <strong className={styles.trendValue}>
                    {o2Burn.toFixed(2)} <small>L/MIN</small>
                  </strong>
                  <StatusBadge tone={o2BurnTone} dot>
                    {o2BurnTone === 'red' ? 'HIGH EXPENDITURE' : o2BurnTone === 'amber' ? 'ELEVATED' : 'NOMINAL'}
                  </StatusBadge>
                </div>
              </div>
              <div className={styles.trendDelta}>
                <span>LOAD: {metabolicW} W</span>
                <span style={{ color: o2BurnTone === 'red' ? 'var(--red)' : o2BurnTone === 'amber' ? 'var(--amber)' : 'var(--green)' }}>
                  RESERVE: {o2LeftPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className={styles.trendChartWrap}>
              <TrendAreaChart
                values={o2BurnHistory}
                color={o2BurnTone === 'red' ? 'var(--red)' : o2BurnTone === 'amber' ? 'var(--amber)' : 'var(--blue-bright)'}
                gradientId="grad-o2burn"
                label="Metabolic O2 burn rate trend"
                height={68}
              />
            </div>
            <div className={styles.trendFooter}>
              <span>T - 24S</span>
              <span>MASS-FLOW PLSS TELEMETRY</span>
              <span>LIVE</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* Floating Visor Modal with V2 VisorHud */}
      {showVisorPopup && (
        <div className={styles.hudPopupOverlay} onClick={() => setShowVisorPopup(false)}>
          <div
            className={styles.hudPopupBox}
            style={{ width: '1040px', maxWidth: '96vw', background: '#02050c', border: '1px solid var(--blue-bright)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--blue-bright)', letterSpacing: '0.1em' }}>
                SPACESUIT AR HELMET VISOR // {envTitle(env).toUpperCase()} · {crewMeta[crew]?.name.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => setShowVisorPopup(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '18px', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{
              aspectRatio: '16 / 9',
              width: '100%',
              overflow: 'hidden',
              borderRadius: '8px',
              border: '1px solid #1d3354',
              background: '#010204',
              position: 'relative',
            }}>
              <VisorHud model={visor} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                {isOutside ? 'Dynamic walk-back & buddy radar active' : 'Cabin mode: shirt-sleeve environment · safe oxygen supply'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a
                  href={`/v2/visor?crew=${crew}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--blue-bright)',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    border: '1px solid var(--line-subtle)',
                    borderRadius: '4px'
                  }}
                >
                  OPEN IN STANDALONE TAB ↗
                </a>
                <Button variant="secondary" size="sm" onClick={() => setShowVisorPopup(false)}>
                  CLOSE VISOR HUD
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
