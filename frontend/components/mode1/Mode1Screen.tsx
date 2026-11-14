'use client';

import React, { useState, useEffect } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { ElevationProfile, LineChart, Sparkline } from '../charts/Charts';
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
      setSmo2History(prev => [...prev.slice(-20), vitals.smo2]);
    }
  }, [vitals?.t, vitals?.smo2]);

  useEffect(() => {
    if (modelB?.o2_burn_l_min !== undefined) {
      setO2BurnHistory(prev => [...prev.slice(-20), modelB.o2_burn_l_min]);
    }
  }, [vitals?.t, modelB?.o2_burn_l_min]);

  useEffect(() => {
    void api.getRouteProfile().then(setRoutePoints).catch(() => {});
  }, [api]);

  // Defaults if loading
  const walkBackMin = modelB?.walk_back_min ?? 24.5;
  const o2LeftPct = modelB?.o2_left_pct ?? 78.4;
  const o2Burn = modelB?.o2_burn_l_min ?? 1.45;
  const metabolicW = modelB?.metabolic_w ?? 265;
  const fatigueScore = modelA?.fatigue_score ?? 42;
  const legsFailMin = modelA?.legs_fail_min ?? 28;
  const isFallback = modelA?.fallback ?? false;
  const isDizzy = vitals?.dizzy ?? false;

  const isCriticalWalkBack = walkBackMin < 15;
  const isWarningFatigue = legsFailMin <= 15 || fatigueScore >= 70;

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
      : 'TRAVERSE ON SCHEDULE // MARGIN NOMINAL';

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
              <strong>15-MINUTE EARLY WARNING // MODEL A:</strong> Muscle failure predicted in{' '}
              <strong>{legsFailMin.toFixed(1)} MIN</strong> before suit CO₂ spikes. Recommendation: Halt for 60s micro-recovery.
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
              <div
                className={styles.timerNumber}
                style={{ color: isCriticalWalkBack ? 'var(--red)' : walkBackMin < 30 ? 'var(--amber)' : 'var(--green)' }}
              >
                {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')}
              </div>
              <span className={styles.timerUnit}>MINUTES REMAINING BEFORE POINT OF NO RETURN</span>
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
              <small>NASA-STD-3001</small>
            </div>

            <div className={styles.metricTile}>
              <span>LEGS FAIL IN</span>
              <strong style={{ color: legsFailMin <= 15 ? 'var(--red)' : 'var(--text-strong)' }}>
                {legsFailMin.toFixed(1)} MIN
              </strong>
              <small>Pre-CO₂ Warning</small>
            </div>

            <div className={styles.metricTile}>
              <span>CALF SmO₂</span>
              <strong>{vitals?.smo2 ? vitals.smo2.toFixed(1) : '78.0'}%</strong>
              <small>Tissue Oxygen</small>
            </div>

            <div className={styles.metricTile}>
              <span>sEMG MDF SHIFT</span>
              <strong>{vitals?.emg_mdf ? `${vitals.emg_mdf.toFixed(1)}%` : '-2.4%'}</strong>
              <small>Median Freq</small>
            </div>
          </div>

          <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-subtle)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            GAIT WOBBLE / ASYMMETRY: <strong style={{ color: '#fff' }}>{vitals?.gait ? vitals.gait.toFixed(2) : '0.22'} SD</strong> · SPEED: {vitals?.speed ? vitals.speed.toFixed(1) : '2.5'} KM/H
          </div>
        </Panel>

      </div>

      {/* Route Elevation Profile (LRO LOLA Site04) */}
      <Panel
        eyebrow="LRO LOLA / SITE 04 SHACKLETON CRATER"
        title="Route topography & point of no return"
        action={<StatusBadge tone="blue">MAP SCALE 5M/PX</StatusBadge>}
      >
        <ElevationProfile values={elevationArray} position={0.62} turnaround={0.76} />
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              CALF SmO₂ DESATURATION TREND (OPTICAL NIRS)
            </div>
            <Sparkline values={smo2History} color="var(--red)" label="SmO2 trend" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              METABOLIC O₂ CONSUMPTION (L/MIN)
            </div>
            <Sparkline values={o2BurnHistory} color="var(--blue-bright)" label="O2 burn trend" />
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
                  {isDizzy ? (
                    <span style={{ color: 'var(--red)' }}>⚠️ STOP · REST</span>
                  ) : (
                    <span>
                      {Math.floor(walkBackMin).toString().padStart(2, '0')}:
                      {Math.floor((walkBackMin % 1) * 60).toString().padStart(2, '0')} · STOP 60S · ↗ 34M
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
