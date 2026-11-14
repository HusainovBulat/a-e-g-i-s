'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { aegisApi } from '../../../lib/api/client';
import type { CrewId, Scenario, SensorPacket } from '../../../lib/api/types';
import { requestMotionPermission, subscribeMotion } from '../../../lib/motion';
import { Button } from '../ui/Button';
import { Segmented, Slider, Toggle } from '../ui/Controls';
import { Icon } from '../ui/icons';
import { StatusPill } from '../ui/StatusPill';
import styles from './phone.module.css';

/** Scenario badge colour from scenarios.json ("#EF4444" / "red" ...) -> badge tone. */
export function badgeTone(color: string | undefined): 'red' | 'amber' | 'green' {
  const c = String(color ?? '').toLowerCase();
  if (c === 'red' || c === '#ef4444') return 'red';
  if (c === 'amber' || c === 'yellow' || c === '#f59e0b') return 'amber';
  return 'green';
}

/** First word of the scenario badge without emoji ("🔴 EMERGENCY · STEMI" -> "Emergency"). */
const badgeText = (badge: string) => {
  const t = badge.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)[0] ?? '';
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : '';
};

export function PhoneSimulator() {
  const [crew, setCrew] = useState<CrewId>('A');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('normal_walk');
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: true, text: 'Ready to stream at 1 Hz' });
  const ok = (text: string) => setStatus({ ok: true, text });
  const fail = (text: string) => setStatus({ ok: false, text });

  // Crew from the QR link (?crew=A / B / C / D)
  useEffect(() => {
    const urlCrew = new URLSearchParams(window.location.search).get('crew')?.toUpperCase();
    if (urlCrew && ['A', 'B', 'C', 'D'].includes(urlCrew)) setCrew(urlCrew as CrewId);
  }, []);

  const [hr, setHr] = useState(74);
  const [sys, setSys] = useState(118);
  const [dia, setDia] = useState(76);
  const [spo2, setSpo2] = useState(98);
  const [slope, setSlope] = useState(4);
  const [smo2, setSmo2] = useState(78);
  const [bloodSugar, setBloodSugar] = useState(104);
  const [temp] = useState(36.7);
  const [nirsOk, setNirsOk] = useState(true);
  const [dizzy, setDizzy] = useState(false);
  const [fall, setFall] = useState(false);

  // While a server-side scenario plays, only explicit changes (sliders, tilt, fall) are sent:
  // the backend treats phone values during playback as sticky overrides, so a 1 Hz
  // keepalive with all slider values would freeze the scenario's 60-s timeline.
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [motionActive, setMotionActive] = useState(false);

  useEffect(() => { void aegisApi.getScenarios().then(setScenarios).catch(() => {}); }, []);

  const sendTelemetry = useCallback(async (overrides: Partial<SensorPacket> = {}) => {
    try {
      await aegisApi.sendSensors({ crew, hr, sys, dia, spo2, slope, smo2, blood_sugar_mgdl: bloodSugar, temp, nirs_ok: nirsOk, dizzy, fall, ...overrides });
      ok(`Streaming to console · Crew ${crew}`);
    } catch {
      fail('Uplink lost — check Wi-Fi');
    }
  }, [crew, hr, sys, dia, spo2, slope, smo2, bloodSugar, temp, nirsOk, dizzy, fall]);

  // Send a slider change immediately (also during a scenario: live override).
  const updateMetric = (param: 'hr' | 'sys' | 'dia' | 'spo2' | 'slope' | 'smo2' | 'bloodSugar', val: number) => {
    const next = { hr, sys, dia, spo2, slope, smo2, bloodSugar, [param]: val };
    ({ hr: setHr, sys: setSys, dia: setDia, spo2: setSpo2, slope: setSlope, smo2: setSmo2, bloodSugar: setBloodSugar })[param](val);
    aegisApi
      .sendSensors({ crew, hr: next.hr, sys: next.sys, dia: next.dia, spo2: next.spo2, slope: next.slope, smo2: next.smo2, blood_sugar_mgdl: next.bloodSugar, temp, nirs_ok: nirsOk, dizzy, fall })
      .then(() => ok(`Streaming to console · Crew ${crew}`))
      .catch(() => fail('Uplink lost — check Wi-Fi'));
  };

  // 1 Hz keepalive (paused while the server plays a scenario for this crew)
  useEffect(() => {
    if (scenarioRunning) return;
    const interval = setInterval(() => { void sendTelemetry(); }, 1000);
    return () => clearInterval(interval);
  }, [sendTelemetry, scenarioRunning]);

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
      await aegisApi.sendSensors({ crew, scenario: sc.id });
      setScenarioRunning(sc.id !== 'reset_all');
      if (sc.id === 'fall_in_crater') {
        setFall(true);
        await aegisApi.sendSensors({ crew, fall: true });
      }
      ok(`Running: ${sc.name}`);
    } catch {
      fail('Could not start scenario — base server unreachable');
    }
  };

  const toggleFall = async () => {
    const nextFall = !fall;
    setFall(nextFall);
    try {
      if (nextFall) {
        ok(`Fall sent · Crew ${crew}`);
        await aegisApi.sendSensors({ crew, fall: true });
        await aegisApi.sendSensors({ crew, scenario: 'fall_in_crater' });
        setScenarioRunning(true);
      } else {
        ok(`Fall cancelled · Crew ${crew}`);
        await aegisApi.sendSensors({ crew, fall: false });
        await aegisApi.postEvent({ type: 'ack', crew, text: `Crew ${crew} conscious · fall cancelled` });
      }
    } catch {
      fail('Uplink lost — check Wi-Fi');
    }
  };

  const resetNominal = () => {
    setHr(74); setSys(118); setDia(76); setSpo2(98); setSlope(4); setSmo2(78); setBloodSugar(104);
    setNirsOk(true); setDizzy(false); setFall(false); setScenarioRunning(false);
    void sendTelemetry({ hr: 74, sys: 118, dia: 76, spo2: 98, slope: 4, smo2: 78, blood_sugar_mgdl: 104, nirs_ok: true, dizzy: false, fall: false });
  };

  const handleEnableMotion = async () => {
    const granted = await requestMotionPermission();
    if (!granted) {
      alert('Motion permission denied');
      return;
    }
    setMotionActive(true);
  };

  // The subscription must survive state changes: re-subscribing on every slope update reset the
  // tilt to a default and made the slope flicker. Latest values are read through refs instead.
  const lastSentSlope = useRef<number | null>(null);
  const lastSlopeSentAt = useRef(0);
  const sendTelemetryRef = useRef(sendTelemetry);
  sendTelemetryRef.current = sendTelemetry;
  const crewRef = useRef(crew);
  crewRef.current = crew;
  useEffect(() => {
    if (!motionActive) return;
    return subscribeMotion(data => {
      if (data.slopeAngle !== undefined && data.slopeAngle !== lastSentSlope.current) {
        lastSentSlope.current = data.slopeAngle;
        setSlope(data.slopeAngle);
        // At most ~4 tilt packets/s; the 1 Hz uplink carries the latest slope anyway.
        const now = Date.now();
        if (now - lastSlopeSentAt.current >= 250) {
          lastSlopeSentAt.current = now;
          void aegisApi.sendSensors({ crew: crewRef.current, slope: data.slopeAngle }).catch(() => fail('Uplink lost — check Wi-Fi'));
        }
      }
      if (data.shakeDetected) {
        setFall(true);
        void sendTelemetryRef.current({ fall: true });
      }
    });
  }, [motionActive]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true"><Icon name="shield" size={22} strokeWidth={2.2} /></span>
          <div>
            <strong>Suit sensors</strong>
            <span>A.E.G.I.S. phone uplink</span>
          </div>
        </div>
        <StatusPill tone={status.ok ? 'green' : 'red'} pulse={status.ok}>{status.ok ? 'Live' : 'Offline'}</StatusPill>
      </header>

      <Segmented<CrewId>
        label="Crew member"
        block
        value={crew}
        options={(['A', 'B', 'C', 'D'] as CrewId[]).map(id => ({ value: id, label: `Crew ${id}` }))}
        onChange={setCrew}
      />

      <p className={`${styles.status} ${status.ok ? '' : styles.statusError}`} role="status">{status.text}</p>

      {fall ? (
        <section className={styles.fallCard} role="alert">
          <strong>Fall detected</strong>
          <p>The console started a 30-second rescue countdown.</p>
          <Button variant="danger" size="lg" block icon="check" onClick={toggleFall}>Fall active — cancel</Button>
        </section>
      ) : (
        <Button variant="danger" size="lg" block icon="fall" onClick={toggleFall}>Simulate a fall</Button>
      )}

      {motionActive ? (
        <div className={styles.motionOn}>
          <Icon name="activity" size={18} />
          <span>Motion sensors active</span>
          <small>Tilt = slope · Shake = fall</small>
        </div>
      ) : (
        <Button variant="secondary" block icon="phone" onClick={handleEnableMotion}>Enable motion sensors</Button>
      )}

      <section className={styles.section}>
        <h2>Scenarios</h2>
        <div className={styles.scenarios}>
          {scenarios.map(sc => (
            <button
              key={sc.id}
              type="button"
              aria-pressed={activeScenarioId === sc.id}
              className={`${styles.scenario} ${activeScenarioId === sc.id ? styles.scenarioActive : ''}`}
              onClick={() => handleSelectScenario(sc)}
            >
              <span className={styles.scenarioHead}>
                <strong>{sc.name}</strong>
                {badgeText(sc.badge) && <StatusPill tone={badgeTone(sc.badge_color)}>{badgeText(sc.badge)}</StatusPill>}
              </span>
              <small>{sc.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Heart & breathing</h2>
        <div className={styles.group}>
          <Slider label="Heart rate" value={hr} min={40} max={160} unit=" bpm" onChange={v => updateMetric('hr', v)} />
          <Slider label="Systolic blood pressure" value={sys} min={60} max={180} unit=" mmHg" onChange={v => updateMetric('sys', v)} />
          <Slider label="Diastolic blood pressure" value={dia} min={40} max={120} unit=" mmHg" onChange={v => updateMetric('dia', v)} />
          <Slider label="Blood oxygen (SpO₂)" value={spo2} min={80} max={100} unit=" %" onChange={v => updateMetric('spo2', v)} />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Legs & terrain</h2>
        <div className={styles.group}>
          <Slider label="Crater slope" value={slope} min={0} max={22} unit="°" onChange={v => updateMetric('slope', v)} />
          <Slider label="Calf muscle oxygen (SmO₂)" value={smo2} min={30} max={95} unit=" %" onChange={v => updateMetric('smo2', v)} />
          <Slider label="Blood sugar" value={bloodSugar} min={60} max={180} unit=" mg/dL" onChange={v => updateMetric('bloodSugar', v)} />
          <Toggle label="Muscle oxygen sensor OK" checked={nirsOk} onChange={setNirsOk} />
          <Toggle label="Feeling dizzy" checked={dizzy} onChange={setDizzy} />
        </div>
      </section>

      <Button variant="ghost" block onClick={resetNominal}>Reset all to nominal</Button>
    </div>
  );
}
