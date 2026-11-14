'use client';

import React, { useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { ElevationProfile, LineChart, Sparkline, TrendAreaChart } from '../charts/Charts';
import { Icon } from '../ui/icons';
import { useConsole } from '../../lib/ConsoleProvider';
import type { RoutePoint } from '../../lib/api/types';
import styles from './mode1.module.css';

export function Mode1Screen() {
  const { currentCrew, crew, api } = useConsole();
  const [showVisorPopup, setShowVisorPopup] = useState<boolean>(false);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [visorStatusText, setVisorStatusText] = useState<string>('VISOR HUD SYNCED');
  const [sendingVisor, setSendingVisor] = useState<boolean>(false);

  const vitals = currentCrew?.vitals;
  const modelA = currentCrew?.model_a;
  const modelB = currentCrew?.model_b;

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
    void api.getRouteProfile().then(setRoutePoints).catch(() => {});
  }, [api]);

  // Defaults if loading
  const rawWalkBackMin = modelB?.walk_back_min ?? 24.5;
  const walkBackMin = Math.min(120, Math.max(0, rawWalkBackMin));
  const o2LeftPct = modelB?.o2_left_pct ?? 78.4;
  const o2Burn = modelB?.o2_burn_l_min ?? 1.45;
  const metabolicW = modelB?.metabolic_w ?? 265;
  const fatigueScore = modelA?.fatigue_score ?? 42;
  // null from Model A = fatigue stable / recovering -> no countdown
  const legsFailMin = modelA ? modelA.legs_fail_min : null;
  const legsFailText = legsFailMin === null ? 'STABLE' : `${legsFailMin.toFixed(1)} MIN`;
  const isFallback = modelA?.fallback ?? false;
  const isDizzy = vitals?.dizzy ?? false;
  const isFall = Boolean(vitals?.fall);

  const currentSmo2 = vitals?.smo2 ?? (smo2History[smo2History.length - 1] ?? 78.0);
  const smo2Tone: 'green' | 'amber' | 'red' = currentSmo2 < 60 ? 'red' : currentSmo2 < 72 ? 'amber' : 'green';
  const o2BurnTone: 'green' | 'amber' | 'red' = o2Burn > 2.0 ? 'red' : o2Burn > 1.65 ? 'amber' : 'green';

  const isCriticalWalkBack = walkBackMin < 15;
  const isWarningFatigue = (legsFailMin !== null && legsFailMin <= 15) || fatigueScore >= 70;
  const isCritical = isCriticalWalkBack || isWarningFatigue || isDizzy || isFall || smo2Tone === 'red' || o2BurnTone === 'red';
  const isCaution = !isCritical && (walkBackMin < 30 || fatigueScore >= 50 || (legsFailMin !== null && legsFailMin <= 30) || smo2Tone === 'amber' || o2BurnTone === 'amber');
  const isNominal = !isCritical && !isCaution;

  // Format elevation points for SVG profile
  const elevationArray = routePoints.length > 0
    ? routePoints.map(p => p.elevation_m)
    : [12, 14, 17, 15, 20, 23, 21, 28, 26, 30, 34, 31, 39, 43, 41, 47, 45, 54, 51, 60, 58, 64, 69, 66, 75, 79, 73, 82, 88, 85, 94, 90, 98];

  const handleSendToVisor = async () => {
    setSendingVisor(true);
    const msg = isCriticalWalkBack
      ? 'TURN-BACK POINT REACHED // RETURN TO LUNAR BASE'
      : isWarningFatigue
      ? 'REST 60S // QUADRICEPS DESATURATION WARNING'
      : isCritical || isCaution
      ? 'STOP 60S // PHYSIOLOGICAL CAUTION'
      : 'TRAVERSE ON SCHEDULE // PROCEED NOMINAL';

    try {
      await api.postEvent({
        type: 'visor_instruction',
        crew,
        text: msg,
      });
      setVisorStatusText(`SENT TO VISOR: "${msg}"`);
      setTimeout(() => setVisorStatusText('VISOR HUD SYNCED'), 4000);
    } catch {
      setVisorStatusText('FAILED TO TRANSMIT TO VISOR');
    } finally {
      setSendingVisor(false);
    }
  };

  return (
    <div className={styles.screen}>
      
      {/* Early Warning Banner */}
      {isWarningFatigue && (
        <div className={styles.warningBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          <Button variant="danger" size="sm" onClick={handleSendToVisor} disabled={sendingVisor}>
            SEND REST DIRECTIVE TO CREW
          </Button>
        </div>
      )}

      {/* Top Row: Walk-Back Hero & Model A */}
      <div className={styles.topRow}>
        
        {/* Walk-Back Limit (Model B) */}
        <Panel
          eyebrow="MODEL B // POINT OF NO RETURN"
          title="Dynamic walk-back limit"
          action={
            <StatusBadge tone={isCriticalWalkBack ? 'red' : walkBackMin < 30 ? 'amber' : 'green'} dot>
              {isCriticalWalkBack ? 'MARGIN CRITICAL' : walkBackMin < 30 ? 'MARGIN SHORT' : 'MARGIN SAFE'}
            </StatusBadge>
          }
        >
          <div className={styles.walkBackHero}>
            <div className={styles.timerDisplay}>
              {vitals?.fall ? (
                <>
                  <div className={styles.timerNumber} style={{ color: 'var(--red)' }}>
                    00:00
                  </div>
                  <span className={styles.timerUnit} style={{ color: 'var(--red)', fontWeight: 700 }}>
                    EVA ABORTED // CREW DOWN · RESCUE IN PROGRESS
                  </span>
                </>
              ) : (
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
              )}
            </div>

            <div className={styles.timerBar}>
              <div
                className={styles.timerBarFill}
                style={{
                  width: `${Math.min(100, (walkBackMin / 60) * 100)}%`,
                  backgroundColor: isCriticalWalkBack ? 'var(--red)' : walkBackMin < 30 ? 'var(--amber)' : 'var(--green)',
                }}
              />
            </div>

            <div className={styles.timerMeta}>
              <span>METABOLIC EXPENDITURE: {metabolicW} W</span>
              <span>O₂ BURN RATE: {o2Burn.toFixed(2)} L/MIN</span>
              <span>PLSS RESERVE: {o2LeftPct.toFixed(1)}%</span>
            </div>

            {/* Plain-English explanation box for non-doctors */}
            <div
              style={{
                padding: '9px 12px',
                background: isCriticalWalkBack
                  ? 'rgba(239, 68, 68, 0.12)'
                  : walkBackMin < 30
                  ? 'rgba(245, 179, 1, 0.12)'
                  : 'rgba(46, 204, 113, 0.12)',
                border: `1px solid ${
                  isCriticalWalkBack
                    ? 'var(--red)'
                    : walkBackMin < 30
                    ? 'var(--amber)'
                    : 'var(--green)'
                }`,
                fontSize: '11px',
                lineHeight: 1.45,
                color: isCriticalWalkBack
                  ? '#fca5a5'
                  : walkBackMin < 30
                  ? '#fde68a'
                  : '#a7f3d0',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {isCriticalWalkBack ? (
                <span>🚨 TURN BACK NOW: Point of no return reached. Head back to the habitat airlock immediately.</span>
              ) : walkBackMin < 30 ? (
                <span>⚠️ SLOW DOWN (STOP 60s): Steep climb is draining leg oxygen faster than blood can deliver it. Rest 60 seconds and reduce pace by 30% to avoid leg cramps.</span>
              ) : (
                <span>✅ SAFE TO PROCEED: You have plenty of oxygen and leg stamina to climb back to the airlock.</span>
              )}
            </div>

            <div className={styles.visorControls}>
              <Button variant="primary" size="sm" onClick={handleSendToVisor} disabled={sendingVisor}>
                <Icon name="arrowUpRight" size={14} />
                SEND TO CREW VISOR
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowVisorPopup(true)}>
                <Icon name="scan" size={14} />
                POPUP VISOR + WRIST HUD
              </Button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                {visorStatusText}
              </span>
            </div>
          </div>
        </Panel>

        {/* Model A Muscles Panel */}
        <Panel
          eyebrow="MODEL A // MYO-FATIGUE CASCADE"
          title="Lower-limb fatigue"
          action={
            isFallback ? (
              <StatusBadge tone="amber" dot>NIRS FOGGED / FALLBACK</StatusBadge>
            ) : (
              <StatusBadge tone="blue" dot>OPTICAL NIRS ACTIVE</StatusBadge>
            )
          }
        >
          <div className={styles.metricsGrid2}>
            <div className={styles.metricTile}>
              <span>FATIGUE SCORE</span>
              <strong style={{ color: fatigueScore >= 70 ? 'var(--red)' : fatigueScore >= 50 ? 'var(--amber)' : 'var(--green)' }}>
                {fatigueScore} / 100
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

      {/* Route Elevation Profile (LRO LOLA Site04) */}
      <Panel
        eyebrow="LRO LOLA / SITE 04 SHACKLETON CRATER"
        title="Route topography & point of no return"
        action={<StatusBadge tone="blue">MAP SCALE 5M/PX</StatusBadge>}
      >
        {(() => {
          const distanceM = currentCrew?.model_b?.distance_m ?? (vitals?.distance_m ?? 1850);
          const totalRouteM = 4950;
          const currentPosRatio = Math.max(0.08, Math.min(0.88, distanceM / totalRouteM));
          const maxForwardMargin = 0.94 - currentPosRatio;
          const walkBackFactor = Math.max(0, Math.min(1, walkBackMin / 90));
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

      {/* Floating Visor & Wrist HUD Popup */}
      {showVisorPopup && (
        <div className={styles.hudPopupOverlay} onClick={() => setShowVisorPopup(false)}>
          <div className={styles.hudPopupBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--blue-bright)', letterSpacing: '0.1em' }}>
                SPACESUIT AR VISOR & FOREARM CUFF PREVIEW
              </span>
              <button
                type="button"
                onClick={() => setShowVisorPopup(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            {/* AR Visor Strip */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                PROJECTED IN UPPER-RIGHT HELMET VISOR (HUD):
              </div>
              <div className={styles.visorStrip}>
                <div className={styles.visorReticle}>
                  {isFall ? (
                    <span style={{ color: 'var(--red)' }}>🚨 FALL DETECTED · RESCUE ARMED</span>
                  ) : isCritical ? (
                    <span style={{ color: 'var(--red)' }}>
                      ⚠️ {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                      {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · STOP 60S · ↗ 34M
                    </span>
                  ) : isCaution ? (
                    <span style={{ color: 'var(--amber)' }}>
                      ⚠️ {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                      {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · STOP 60S · ↗ 34M
                    </span>
                  ) : (
                    <span style={{ color: 'var(--green)' }}>
                      {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                      {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · PROCEED NOMINAL · ↗ 34M
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  SLOPE {vitals?.slope ? vitals.slope.toFixed(0) : '12'}° · AZ 248°
                </div>
              </div>
            </div>

            {/* Forearm Cuff ("часы" скафандра) */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                FOREARM CUFF DISPLAY (WRIST):
              </div>
              <div className={styles.wristFrame}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--text-strong)' }}>
                    O₂ {o2LeftPct.toFixed(0)}% · HR {vitals?.hr ?? 74}
                  </span>
                  <StatusBadge tone="green" dot>AUTO LOOP ARMED</StatusBadge>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '9px', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', border: '1px solid var(--line-subtle)' }}>
                    100% O₂ SURGE: <span style={{ color: 'var(--green)' }}>READY</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', border: '1px solid var(--line-subtle)' }}>
                    HEATING LCVG: <span style={{ color: 'var(--green)' }}>READY</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', border: '1px solid var(--line-subtle)' }}>
                    BURST S-BAND: <span style={{ color: 'var(--green)' }}>ONLINE</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', border: '1px solid var(--line-subtle)' }}>
                    EVAC RADAR: <span style={{ color: 'var(--blue-bright)' }}>34 M</span>
                  </div>
                </div>

                <div className={styles.wristButtons}>
                  <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => setShowVisorPopup(false)}>
                    OK / ACK
                  </Button>
                  <Button variant="ghost" size="sm" style={{ flex: 1 }}>
                    LIGHT
                  </Button>
                  <Button variant="danger" size="sm" style={{ flex: 1 }} onClick={async () => {
                    await api.postEvent({ type: 'alarm_jump_to_emergency', crew, text: 'SOS TRIGGERED FROM FOREARM CUFF' });
                    setShowVisorPopup(false);
                  }}>
                    SOS ALERT
                  </Button>
                </div>
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => setShowVisorPopup(false)}>
              CLOSE PREVIEW
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
