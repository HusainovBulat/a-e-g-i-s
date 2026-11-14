'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Segmented, Slider, Toggle } from '../ui/Controls';
import { StatusBadge } from '../ui/StatusBadge';
import { Icon } from '../ui/icons';
import { aegisApi } from '../../lib/api/client';
import { requestMotionPermission, subscribeMotion } from '../../lib/motion';
import type { CrewId, Scenario, SensorPacket } from '../../lib/api/types';
import styles from './phone.module.css';

export function PhoneSimulator() {
  const [crew, setCrew] = useState<CrewId>('A');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('normal_walk');
  const [statusMessage, setStatusMessage] = useState<string>('UPLINK READY (1 HZ)');

  // Auto-detect crew from URL query ?crew=A / B / C / D
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlCrew = params.get('crew')?.toUpperCase();
      if (urlCrew && ['A', 'B', 'C', 'D'].includes(urlCrew)) {
        setCrew(urlCrew as CrewId);
      }
    }
  }, []);

  // Sensor parameters
  const [hr, setHr] = useState<number>(74);
  const [sys, setSys] = useState<number>(118);
  const [dia, setDia] = useState<number>(76);
  const [spo2, setSpo2] = useState<number>(98);
  const [slope, setSlope] = useState<number>(4);
  const [smo2, setSmo2] = useState<number>(78);
  const [bloodSugar, setBloodSugar] = useState<number>(104);
  const [temp, setTemp] = useState<number>(36.7);
  const [nirsOk, setNirsOk] = useState<boolean>(true);
  const [dizzy, setDizzy] = useState<boolean>(false);
  const [fall, setFall] = useState<boolean>(false);

  // Motion physics
  const [motionActive, setMotionActive] = useState<boolean>(false);

  // Load scenarios
  useEffect(() => {
    void aegisApi.getScenarios().then(setScenarios).catch(() => {});
  }, []);

  // Send packet to console
  const sendTelemetry = useCallback(async (overrides: Partial<SensorPacket> = {}) => {
    try {
      await aegisApi.sendSensors({
        crew,
        hr,
        sys,
        dia,
        spo2,
        slope,
        smo2,
        blood_sugar_mgdl: bloodSugar,
        temp,
        nirs_ok: nirsOk,
        dizzy,
        fall,
        ...overrides,
      });
      setStatusMessage(`TRANSMITTED TO CONSOLE · CREW ${crew}`);
    } catch {
      setStatusMessage('UPLINK DISCONNECTED');
    }
  }, [crew, hr, sys, dia, spo2, slope, smo2, bloodSugar, temp, nirsOk, dizzy, fall]);

  // Instantly send updated metric when slider is dragged
  const updateMetric = (param: string, val: number) => {
    let newHr = hr;
    let newSys = sys;
    let newDia = dia;
    let newSpo2 = spo2;
    let newSlope = slope;
    let newSmo2 = smo2;
    let newBloodSugar = bloodSugar;

    if (param === 'hr') { setHr(val); newHr = val; }
    else if (param === 'sys') { setSys(val); newSys = val; }
    else if (param === 'dia') { setDia(val); newDia = val; }
    else if (param === 'spo2') { setSpo2(val); newSpo2 = val; }
    else if (param === 'slope') { setSlope(val); newSlope = val; }
    else if (param === 'smo2') { setSmo2(val); newSmo2 = val; }
    else if (param === 'bloodSugar') { setBloodSugar(val); newBloodSugar = val; }

    void aegisApi.sendSensors({
      crew,
      hr: newHr,
      sys: newSys,
      dia: newDia,
      spo2: newSpo2,
      slope: newSlope,
      smo2: newSmo2,
      blood_sugar_mgdl: newBloodSugar,
      temp,
      nirs_ok: nirsOk,
      dizzy,
      fall,
    });
    setStatusMessage(`TRANSMITTED TO CONSOLE · CREW ${crew} (${param.toUpperCase()}: ${val})`);
  };

  // Periodic 1 Hz keepalive
  useEffect(() => {
    const interval = setInterval(() => {
      void sendTelemetry();
    }, 1000);
    return () => clearInterval(interval);
  }, [sendTelemetry]);

  // Handle Scenario trigger
  const handleSelectScenario = async (sc: Scenario) => {
    setActiveScenarioId(sc.id);
    const init = sc.initial_state;
    if (init.hr !== undefined) setHr(init.hr);
    if (init.sys !== undefined) setSys(init.sys);
    if (init.dia !== undefined) setDia(init.dia);
    if (init.spo2 !== undefined) setSpo2(init.spo2);
    if (init.slope !== undefined) setSlope(init.slope);
    if (init.smo2 !== undefined) setSmo2(init.smo2);
    if (init.blood_sugar_mgdl !== undefined) setBloodSugar(init.blood_sugar_mgdl);
    if (init.fall !== undefined) setFall(Boolean(init.fall));
    if (init.dizzy !== undefined) setDizzy(Boolean(init.dizzy));
    if (init.nirs_ok !== undefined) setNirsOk(Boolean(init.nirs_ok));

    try {
      await aegisApi.sendSensors({
        crew,
        scenario: sc.id,
      });
      if (sc.id === 'fall_in_crater') {
        setFall(true);
        await aegisApi.sendSensors({ crew, fall: true });
      }
      setStatusMessage(`TRIGGERED SCENARIO: ${sc.name.toUpperCase()}`);
    } catch {
      setStatusMessage('FAILED TO TRIGGER SCENARIO');
    }
  };

  const toggleFall = async () => {
    const nextFall = !fall;
    setFall(nextFall);
    if (nextFall) {
      setStatusMessage(`🚨 FALL IMPACT TRIGGERED ON CREW ${crew}`);
      await aegisApi.sendSensors({ crew, fall: true });
      await aegisApi.sendSensors({ crew, scenario: 'fall_in_crater' });
    } else {
      setStatusMessage(`FALL CLEARED (NOMINAL) · CREW ${crew}`);
      await aegisApi.sendSensors({ crew, fall: false });
      await aegisApi.postEvent({ type: 'ack', crew, text: `Crew ${crew} conscious · fall cancelled` });
    }
  };

  // Motion subscription
  const handleEnableMotion = async () => {
    const granted = await requestMotionPermission();
    if (!granted) {
      alert('Motion permission denied');
      return;
    }
    setMotionActive(true);
  };

  useEffect(() => {
    if (!motionActive) return;
    const cleanup = subscribeMotion(data => {
      if (data.slopeAngle !== undefined) {
        setSlope(data.slopeAngle);
      }
      if (data.shakeDetected) {
        setFall(true);
        void sendTelemetry({ fall: true });
      }
    });
    return cleanup;
  }, [motionActive, sendTelemetry]);

  return (
    <div className={styles.phonePage}>
      
      {/* Header */}
      <header className={styles.phoneHeader}>
        <div className={styles.phoneBrand}>
          <span className={styles.brandMark}>Ω</span>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#fff' }}>
              A.E.G.I.S. // SENSOR REMOTE
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              NASA SPACE APPS 2026 MOBILE UPLINK
            </div>
          </div>
        </div>
        <StatusBadge tone="green" dot>1 HZ WS</StatusBadge>
      </header>

      {/* Crew Selector */}
      <Segmented<CrewId>
        label="Select Crew"
        value={crew}
        options={[
          { value: 'A', label: 'CREW A' },
          { value: 'B', label: 'CREW B' },
          { value: 'C', label: 'CREW C' },
          { value: 'D', label: 'CREW D' },
        ]}
        onChange={setCrew}
      />

      {/* Motion Sensor Button */}
      {motionActive ? (
        <div className={styles.motionBanner}>
          <span>📱 ACCELEROMETER & GYRO ACTIVE</span>
          <span style={{ color: 'var(--green)' }}>SHAKE = FALL · TILT = SLOPE</span>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={handleEnableMotion}>
          <Icon name="activity" size={14} />
          ENABLE SMARTPHONE MOTION SENSORS
        </Button>
      )}

      {/* 6 Scenarios Grid */}
      <Panel
        eyebrow="MISSION SCENARIO INJECTION"
        title="Simulated events (tap to push to console)"
        action={<StatusBadge tone="blue">6 MODES</StatusBadge>}
      >
        <div className={styles.scenarioGrid}>
          {scenarios.map(sc => (
            <div
              key={sc.id}
              className={`${styles.scenarioCard} ${activeScenarioId === sc.id ? styles.scenarioCardActive : ''}`}
              onClick={() => handleSelectScenario(sc)}
            >
              <div className={styles.scenarioTitle}>{sc.name}</div>
              <div className={styles.scenarioDesc}>{sc.description}</div>
              <StatusBadge tone={sc.badge_color === 'red' ? 'red' : sc.badge_color === 'amber' ? 'amber' : 'green'}>
                {sc.badge}
              </StatusBadge>
            </div>
          ))}
        </div>
      </Panel>

      {fall && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '2px solid var(--red)', padding: '16px', borderRadius: '8px', textAlign: 'center', margin: '0 0 16px' }}>
          <strong style={{ color: 'var(--red)', fontSize: '15px', display: 'block', letterSpacing: '0.05em' }}>🚨 FALL IMPACT DETECTED!</strong>
          <p style={{ color: '#fca5a5', fontSize: '12px', margin: '6px 0 12px' }}>
            30-second crew inactivity rescue countdown armed on Mission Control console.
          </p>
          <Button variant="danger" size="md" onClick={toggleFall}>
            I AM CONSCIOUS // CANCEL RESCUE (FALSE ALARM)
          </Button>
        </div>
      )}

      {/* Manual Sliders */}
      <Panel eyebrow="TELEMETRY MANIPULATION" title="Real-time vitals overrides">
        <div className={styles.controlsCol}>
          <Slider label="HEART RATE" value={hr} min={40} max={160} step={1} unit=" BPM" onChange={v => updateMetric('hr', v)} />
          <Slider label="SYSTOLIC BLOOD PRESSURE" value={sys} min={60} max={180} step={1} unit=" mmHg" onChange={v => updateMetric('sys', v)} />
          <Slider label="DIASTOLIC BLOOD PRESSURE" value={dia} min={40} max={120} step={1} unit=" mmHg" onChange={v => updateMetric('dia', v)} />
          <Slider label="BLOOD OXYGEN SpO₂" value={spo2} min={80} max={100} step={1} unit=" %" onChange={v => updateMetric('spo2', v)} />
          <Slider label="CRATER SLOPE" value={slope} min={0} max={22} step={1} unit=" °" onChange={v => updateMetric('slope', v)} />
          <Slider label="CALF SmO₂" value={smo2} min={30} max={95} step={1} unit=" %" onChange={v => updateMetric('smo2', v)} />
          <Slider label="BLOOD SUGAR" value={bloodSugar} min={60} max={180} step={1} unit=" mg/dL" onChange={v => updateMetric('bloodSugar', v)} />

          {/* Toggles */}
          <div className={styles.togglesRow}>
            <Toggle label="NIRS OK" checked={nirsOk} onChange={setNirsOk} />
            <Toggle label="DIZZY STATE" checked={dizzy} onChange={setDizzy} />
          </div>

          <div className={styles.togglesRow}>
            <Button
              variant={fall ? 'danger' : 'ghost'}
              size="sm"
              onClick={toggleFall}
            >
              {fall ? 'FALL ACTIVE (CANCEL)' : 'TRIGGER FALL IMPACT'}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setHr(74);
                setSys(118);
                setDia(76);
                setSpo2(98);
                setSlope(4);
                setSmo2(78);
                setBloodSugar(104);
                setNirsOk(true);
                setDizzy(false);
                setFall(false);
                void sendTelemetry({
                  hr: 74,
                  sys: 118,
                  dia: 76,
                  spo2: 98,
                  slope: 4,
                  smo2: 78,
                  blood_sugar_mgdl: 104,
                  nirs_ok: true,
                  dizzy: false,
                  fall: false,
                });
              }}
            >
              RESET TO NOMINAL
            </Button>
          </div>
        </div>
      </Panel>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
        {statusMessage}
      </div>

    </div>
  );
}
