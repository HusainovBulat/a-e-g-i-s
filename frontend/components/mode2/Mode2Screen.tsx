'use client';

function formatHumanDecisionPath(rawPath: string | null | undefined, vitals: any, isNominal: boolean, primaryClass: string): string {
  const hr = vitals?.hr ?? 74;
  const sys = vitals?.sys ?? 118;
  const dia = vitals?.dia ?? 76;
  const resp = vitals?.resp ?? 15;
  const st = vitals?.st !== undefined ? vitals.st.toFixed(3) : '0.005';
  const spo2 = vitals?.spo2 !== undefined ? vitals.spo2.toFixed(1) : '98.4';

  if (isNominal || primaryClass.toLowerCase() === 'nominal') {
    return `Why: Breathing rate is normal (${resp}/min), ECG heart wave is normal, and blood pressure is stable (${sys} mmHg) → Healthy / Nominal`;
  }

  const pLower = primaryClass.toLowerCase();
  if (pLower.includes('ischemia') || pLower.includes('coronary') || pLower.includes('infarction') || pLower.includes('heart')) {
    return `Why: Crushing chest pain reported, ECG ST elevation (${st} mV) exceeds safe limits, and blood pressure is critically low (${sys}/${dia} mmHg < 90 mmHg) → Heart Attack (Acute Coronary Ischemia)`;
  }

  if (pLower.includes('barotrauma') || pLower.includes('hypox') || pLower.includes('dyspnea') || Number(spo2) < 92) {
    return `Why: Blood oxygen (${spo2}% < 92%) is dangerously low and breathing rate is rapid (${resp}/min) → Severe Oxygen Deprivation / Decompression Risk`;
  }

  if (pLower.includes('syncope') || pLower.includes('dizz') || pLower.includes('orthostatic')) {
    return `Why: Severe dizziness with acute drop in blood pressure (${sys}/${dia} mmHg) → Fainting / Orthostatic Collapse`;
  }

  if (pLower.includes('heat') || pLower.includes('thermo')) {
    return `Why: Core body temperature is high with elevated pulse (${hr} bpm) → Heat Exhaustion / Cooling Loop Active`;
  }

  if (rawPath) {
    return 'Why: ' + rawPath
      .replace(/Resp rate\s*([\d.]+)\s*<=\s*([\d.]+)/gi, 'Breathing rate is $1/min (limit $2)')
      .replace(/ST elevation\s*\(?mV\)?\s*([\d.]+)\s*<=\s*([\d.]+)/gi, 'ECG heart wave $1 mV (limit $2)')
      .replace(/Systolic BP\s*([\d.]+)\s*<=\s*([\d.]+)/gi, 'Blood pressure $1 mmHg (limit $2)')
      .replace(/SpO2\s*([\d.]+)\s*<=\s*([\d.]+)/gi, 'Oxygen level $1% (limit $2)')
      .replace(/<=\s*/g, 'is under ')
      .replace(/>=\s*/g, 'exceeds ')
      .replace(/->/g, '→');
  }

  return `Why: Vitals recorded at ${hr} BPM, ${sys}/${dia} mmHg, SpO₂ ${spo2}% → ${primaryClass}`;
}

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { Icon } from '../ui/icons';
import { useConsole } from '../../lib/ConsoleProvider';
import { createSpeechRecognizer, speakInstruction, stopSpeaking } from '../../lib/speech';
import type { ProtocolStep, SymptomId, TriageResponse } from '../../lib/api/types';
import styles from './mode2.module.css';


function resolveStepImage(step: ProtocolStep, isNominal: boolean, usedImages: Set<string>): { src: string; alt: string } | null {
  const fullText = `${step.title} ${step.instruction}`.toLowerCase();
  if (isNominal) {
    if (fullText.includes('monitoring') || fullText.includes('biometrics') || step.order === 1) {
      return { src: '/images/nominal_step1_maintain_monitoring.png', alt: 'Wrist Telemetry: All Systems Nominal' };
    }
    if (fullText.includes('routine') || fullText.includes('sampling') || fullText.includes('tasks') || step.order === 2) {
      return { src: '/images/nominal_step2_routine_eva_tasks.png', alt: 'Lunar Geology: Sampling & Exploration' };
    }
    if (fullText.includes('check-in') || fullText.includes('habitat') || fullText.includes('telemetry') || step.order === 3) {
      return { src: '/images/nominal_step3_regular_checkin.png', alt: '15-Minute Habitat AR Telemetry Sync' };
    }
    return null;
  }

  // 1. Repressurize Suit to 5.0 PSI (Decompression Barotrauma / suit breach)
  if (fullText.includes('repressurize') || fullText.includes('suit pressure') || fullText.includes('5.0 psi') || (fullText.includes('pressure') && fullText.includes('suit'))) {
    if (!usedImages.has('repressurize')) {
      usedImages.add('repressurize');
      return { src: '/images/2_repressurize_suit_5psi.png', alt: 'Artemis Suit Repressurization to 5.0 PSI' };
    }
  }

  // 2. 100% Normobaric Oxygen / Flush Breathing Loop (Wash out nitrogen)
  if (fullText.includes('normobaric') || fullText.includes('wash out nitrogen') || (fullText.includes('breathing loop') && fullText.includes('flush'))) {
    if (!usedImages.has('normobaric')) {
      usedImages.add('normobaric');
      return { src: '/images/3_normobaric_oxygen_loop.png', alt: '100% Normobaric Oxygen Loop & Mask Unit' };
    }
  }

  // 3. AED / Defibrillator
  if (fullText.includes('aed') || fullText.includes('defibrillator') || fullText.includes('rhythm analysis')) {
    if (!usedImages.has('aed')) {
      usedImages.add('aed');
      return { src: '/images/2_3_step3_defibrillator_pads.png', alt: 'AED Defibrillator Pad Placement' };
    }
  }

  // 4. Posture / Semi-sitting 30-45° / Elevation / Bed
  if (fullText.includes('posture') || fullText.includes('semi-sitting') || fullText.includes('elevat') || fullText.includes('supine') || (fullText.includes('position') && !fullText.includes('sampling'))) {
    if (!usedImages.has('position')) {
      usedImages.add('position');
      return { src: '/images/2_1_step1_position_casualty.png', alt: '30° Semi-Sitting Casualty Posture' };
    }
  }

  // 5. High-flow O2 / Oxygen Purge / Umbilical / Mask / Breathing loop
  if (fullText.includes('mask') || fullText.includes('umbilical') || fullText.includes('purge') || fullText.includes('airway') || fullText.includes('oxygen') || fullText.includes('100%')) {
    if (!usedImages.has('oxygen')) {
      usedImages.add('oxygen');
      return { src: '/images/2_2_step2_oxygen_umbilical.png', alt: 'High-Flow 100% O2 Purge Umbilical' };
    }
  }

  // 6. Hydration & Electrolytes (Syncope / Orthostatic)
  if (fullText.includes('hydration') || fullText.includes('electrolyte') || fullText.includes('saline')) {
    if (!usedImages.has('hydration')) {
      usedImages.add('hydration');
      return { src: '/images/3_1_quest1_electrolyte_rehydration.png', alt: 'Isotonic Electrolyte Hydration' };
    }
  }

  // 7. Hyperbaric chamber / Airlock evacuation
  if (fullText.includes('hyperbaric') || fullText.includes('airlock') || fullText.includes('chamber') || fullText.includes('evacuate')) {
    if (!usedImages.has('airlock')) {
      usedImages.add('airlock');
      return { src: '/images/1_2_gasping_air.png', alt: 'Hyperbaric Airlock Evacuation Chamber' };
    }
  }

  return null;
}

export function Mode2Screen() {
  const { currentCrew, crew, api } = useConsole();
  const vitals = currentCrew?.vitals;

  // Scenario 2A Fall Countdown (30s)
  const [simulatedFall, setSimulatedFall] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(30);
  const [fallCancelled, setFallCancelled] = useState<boolean>(false);

  const hasServerFall = Boolean(vitals?.fall) || (currentCrew?.fall_countdown_s !== undefined && currentCrew?.fall_countdown_s !== null && currentCrew.fall_countdown_s > 0) || Boolean(currentCrew?.alarm?.reasons?.includes('fall'));
  const isFallDetected = (hasServerFall || simulatedFall) && !fallCancelled;

  // Sync server countdown if present
  useEffect(() => {
    if (currentCrew?.fall_countdown_s !== undefined && currentCrew?.fall_countdown_s !== null) {
      if (currentCrew.fall_countdown_s > 0) {
        setCountdown(Math.ceil(currentCrew.fall_countdown_s));
        setFallCancelled(false);
      }
    }
  }, [currentCrew?.fall_countdown_s]);

  // If vitals.fall turns true from phone
  useEffect(() => {
    if (vitals?.fall) {
      setFallCancelled(false);
    }
  }, [vitals?.fall]);

  // Countdown timer effect
  useEffect(() => {
    if (!isFallDetected) return;
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isFallDetected]);

  // Symptoms Selection - nominal/empty by default
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomId[]>([]);
  const [ultrasoundAttached, setUltrasoundAttached] = useState<boolean>(false);
  const [voiceText, setVoiceText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recognizer, setRecognizer] = useState<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);

  // Triage state
  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);
  const [, startTransition] = useTransition();

  const toggleSymptom = (sym: SymptomId) => {
    setSelectedSymptoms(prev => {
      const willEnable = !prev.includes(sym);
      const next = willEnable ? [...prev, sym] : prev.filter(s => s !== sym);
      
      // Update sensor simulation strictly on user toggle click (never in a 1Hz loop)
      if (sym === 'fall') {
        if (willEnable) {
          setSimulatedFall(true);
          setFallCancelled(false);
          setCountdown(30);
          void api.sendSensors({ crew, fall: true });
        } else {
          setSimulatedFall(false);
          void api.sendSensors({ crew, fall: false });
        }
      } else if (sym === 'chest_pain') {
        if (willEnable) {
          void api.sendSensors({ crew, hr: 118, sys: 82, dia: 50, st: 0.286 });
        } else {
          void api.sendSensors({ crew, hr: 74, sys: 118, dia: 76, st: 0.005 });
        }
      } else if (sym === 'shortness_of_breath') {
        if (willEnable) {
          void api.sendSensors({ crew, spo2: 88.0, resp: 28 });
        } else {
          void api.sendSensors({ crew, spo2: 98.4, resp: 14 });
        }
      }
      return next;
    });
  };

  // Perform Triage on API
  const performTriage = useCallback(async () => {
    try {
      const hasChestPain = selectedSymptoms.includes('chest_pain');
      const hasDyspnea = selectedSymptoms.includes('shortness_of_breath');
      const hasFall = selectedSymptoms.includes('fall') || simulatedFall || Boolean(vitals?.fall);

      // Construct effective vitals for triage classification
      const effectiveVitals = {
        ...(vitals ?? {}),
        hr: hasChestPain ? 118 : (vitals?.hr ?? 74),
        sys: hasChestPain ? 82 : (vitals?.sys ?? 118),
        dia: hasChestPain ? 50 : (vitals?.dia ?? 76),
        st: hasChestPain ? 0.286 : (vitals?.st ?? 0.005),
        spo2: hasDyspnea ? 88.0 : (vitals?.spo2 ?? 98.4),
        fall: hasFall,
      };

      const res = await api.triage({
        crew,
        symptoms: selectedSymptoms,
        vitals: effectiveVitals,
        ultrasound_attached: ultrasoundAttached,
        text: voiceText || undefined,
      });
      setTriageResult(res);
    } catch {
      // ignore
    }
  }, [api, crew, selectedSymptoms, ultrasoundAttached, voiceText, simulatedFall, vitals?.fall, vitals?.sys, vitals?.st, vitals?.spo2]);

  useEffect(() => {
    startTransition(() => {
      void performTriage();
    });
  }, [performTriage]);

  // Setup speech recognizer
  useEffect(() => {
    const rec = createSpeechRecognizer(
      (transcript, matched) => {
        setVoiceText(transcript);
        if (matched.length > 0) {
          setSelectedSymptoms(prev => Array.from(new Set([...prev, ...matched])));
        }
      },
      () => setIsRecording(false)
    );
    setRecognizer(rec);
  }, []);

  const handleVoiceToggle = () => {
    if (!recognizer?.isSupported) return;
    if (isRecording) {
      recognizer.stop();
      setIsRecording(false);
    } else {
      recognizer.start();
      setIsRecording(true);
    }
  };

  // Quick Preset Scenarios
  const triggerChestPainScenario = () => {
    setSelectedSymptoms(['chest_pain', 'dizziness']);
    setSimulatedFall(false);
    void api.sendSensors({
      crew,
      hr: 118,
      sys: 82,
      dia: 50,
      st: 0.286,
      spo2: 94.5,
      fall: false,
    });
  };

  const triggerFallScenario = () => {
    setSelectedSymptoms(['fall', 'dizziness']);
    setSimulatedFall(true);
    setFallCancelled(false);
    setCountdown(30);
    void api.sendSensors({
      crew,
      fall: true,
      hr: 98,
    });
  };

  const triggerHypoxiaScenario = () => {
    setSelectedSymptoms(['shortness_of_breath', 'dizziness']);
    setSimulatedFall(false);
    void api.sendSensors({
      crew,
      spo2: 88.0,
      resp: 28,
    });
  };

  const triggerRestoreNominal = () => {
    setSelectedSymptoms([]);
    setSimulatedFall(false);
    setFallCancelled(true);
    void api.sendSensors({
      crew,
      hr: 74,
      sys: 118,
      dia: 76,
      st: 0.005,
      spo2: 98.4,
      resp: 15,
      fall: false,
    });
    void api.postEvent({
      type: 'ack',
      crew,
      text: 'EMERGENCY CLEARED · NOMINAL BASELINE RESTORED',
    });
  };

  const handleCancelFall = async () => {
    setFallCancelled(true);
    setSimulatedFall(false);
    await api.postEvent({
      type: 'ack',
      crew,
      text: `CREW ${crew} CONSCIOUS · WRIST ACKNOWLEDGED · RESCUE ABORTED`,
    });
    void api.sendSensors({ crew, fall: false });
  };

  // Critical Hard Rules: Nitroglycerin Ban & Oxygen Surge
  const hasChestPain = selectedSymptoms.includes('chest_pain');
  const sysBp = hasChestPain ? 82 : (vitals?.sys ?? 118);
  const isNitroBlocked = sysBp < 90 || (triageResult?.dont_give_list.some(d => d.toLowerCase().includes('nitroglycerin')) ?? false);

  const primaryClass = triageResult?.primary_class ?? (selectedSymptoms.length > 0 || isFallDetected ? 'Acute Coronary Ischemia' : 'Nominal');
  const isNominal = primaryClass.toLowerCase() === 'nominal';

  const handleSpeakAllSteps = () => {
    if (!triageResult?.protocol_steps) return;
    const text = triageResult.protocol_steps.map(s => `${s.title}. ${s.instruction}`).join('. ');
    speakInstruction(text);
  };

  return (
    <div className={styles.screen}>
      
      {/* Top Status Bar (Nominal: subtle line, Emergency: flashing red) */}
      <div className={isNominal ? styles.nominalBar : styles.alarmBar}>
        <div className={isNominal ? styles.nominalTitle : styles.alarmTitle}>
          <Icon name={isNominal ? "activity" : "warning"} size={18} />
          <span>MODE 02 // AUTONOMOUS EMERGENCY MEDICAL TRIAGE · CREW {crew}{isNominal ? ' · MONITORING' : ''}</span>
        </div>
        <StatusBadge tone={isNominal ? "green" : "red"} dot>
          {isNominal ? "NASA-STD-3001 VOL 1 STANDBY" : "NASA-STD-3001 VOL 1 PROTOCOL ARMED"}
        </StatusBadge>
      </div>

      {/* QUICK PRESET SCENARIO BUTTONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <Button variant={hasChestPain ? 'danger' : 'secondary'} size="sm" onClick={triggerChestPainScenario}>
          💔 CHEST PAIN (HEART ATTACK + LOW BP)
        </Button>
        <Button variant={isFallDetected ? 'danger' : 'secondary'} size="sm" onClick={triggerFallScenario}>
          ⚠️ FALL IN CRATER (30S COUNTDOWN)
        </Button>
        <Button variant={selectedSymptoms.includes('shortness_of_breath') ? 'danger' : 'secondary'} size="sm" onClick={triggerHypoxiaScenario}>
          🫁 HYPOXIA (SpO₂ &lt; 92%)
        </Button>
        <Button variant="ghost" size="sm" onClick={triggerRestoreNominal}>
          🟢 RESTORE NOMINAL (CLEAR)
        </Button>
      </div>

      {/* Scenario 2A: Fall in Crater Countdown (30s) */}
      {isFallDetected && (
        <div className={styles.countdownBox}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--red)', letterSpacing: '0.1em' }}>
            🚨 CREW INACTIVITY DETECTED // AUTOMATIC RESCUE TELEMETRY
          </span>
          <div className={styles.countdownNumber}>
            00:{countdown.toString().padStart(2, '0')}
          </div>
          <div style={{ width: '100%', maxWidth: '440px', height: '6px', background: 'rgba(255,255,255,0.1)', marginBottom: '8px' }}>
            <div
              style={{
                width: `${(countdown / 30) * 100}%`,
                height: '100%',
                background: 'var(--red)',
                transition: 'width 1s linear',
              }}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '520px', textAlign: 'center' }}>
            Suit autonomous protocol will engage base rescue dispatch in {countdown} seconds unless manually overridden.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <Button variant="danger" size="md" onClick={handleCancelFall}>
              <Icon name="close" size={16} />
              I AM CONSCIOUS // CANCEL RESCUE (FALSE ALARM)
            </Button>
          </div>
        </div>
      )}

      {/* Suit 4 Automations Status Bar */}
      <div className={styles.autoSystemGrid}>
        <div className={styles.autoSystemCard}>
          <span>100% O₂ BLAST</span>
          <strong style={{ color: isNominal ? 'var(--text-muted)' : 'var(--green)' }}>
            {isNominal ? 'STANDBY' : 'ARMED (HYPERBARIC PURGE)'}
          </strong>
        </div>
        <div className={styles.autoSystemCard}>
          <span>EMERGENCY CORE HEATING</span>
          <strong style={{ color: isNominal ? 'var(--text-muted)' : 'var(--green)' }}>
            {isNominal ? 'STANDBY' : 'ACTIVE (+3.5°C LCVG LOOP)'}
          </strong>
        </div>
        <div className={styles.autoSystemCard}>
          <span>BASE BURST TELEMETRY</span>
          <strong>ONLINE (S-BAND DIRECT)</strong>
        </div>
        <div className={styles.autoSystemCard}>
          <span>EVACUATION BEACON</span>
          <strong style={{ color: isNominal ? 'var(--text-muted)' : 'var(--green)' }}>
            {isNominal ? 'STANDBY' : '↗ 34 M BEARING 042°'}
          </strong>
        </div>
      </div>

      {/* HARD CLINICAL SAFETY BANNER: NITROGLYCERIN BAN */}
      {isNitroBlocked && (
        <div className={styles.nitroBlockBanner}>
          <img
            src="/images/nitro_contraindicated_aspirin.png"
            alt="Nitroglycerin Contraindicated - Aspirin 325mg Indicated"
            style={{
              width: '180px',
              height: '105px',
              objectFit: 'cover',
              borderRadius: '4px',
              border: '2px solid var(--red)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div className={styles.nitroTitle}>
              ⛔ HARD CLINICAL SAFETY INTERLOCK: DO NOT ADMINISTER NITROGLYCERIN!
            </div>
            <div className={styles.nitroDesc}>
              Systolic BP is <strong>{sysBp} mmHg (&lt; 90 mmHg)</strong>. Nitroglycerin administration in acute hypotensive coronary ischemia will cause catastrophic cardiovascular collapse and irreversible cardiogenic shock!
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>💊 <strong>AUTHORIZED COUNTERMEASURE:</strong> Administer chewable Aspirin (325 mg) from Medical Bay Drawer B2.</span>
            </div>
          </div>
        </div>
      )}

      {/* 4 Visual Symptom Cards */}
      <Panel
        eyebrow="CREW SYMPTOM OBSERVATION"
        title="Visual intake cards (tap to toggle)"
        action={
          <StatusBadge tone="blue">
            {selectedSymptoms.length} SELECTED
          </StatusBadge>
        }
      >
        <div className={styles.symptomsGrid}>
          
          <div
            className={`${styles.symptomCard} ${selectedSymptoms.includes('chest_pain') ? styles.symptomCardActive : ''}`}
            onClick={() => toggleSymptom('chest_pain')}
          >
            <div className={styles.symptomThumbWrap}>
              <img src="/images/1_1_clutching_chest.png" alt="Clutching chest pain" className={styles.symptomThumb} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="heart" size={16} style={{ color: 'var(--red)' }} />
              <div className={styles.symptomCardTitle}>CLUTCHING CHEST / CHEST PAIN</div>
            </div>
            <div className={styles.symptomCardDesc}>Holding chest, squeezing pain spreading to left arm, neck, or jaw.</div>
          </div>

          <div
            className={`${styles.symptomCard} ${selectedSymptoms.includes('shortness_of_breath') ? styles.symptomCardActive : ''}`}
            onClick={() => toggleSymptom('shortness_of_breath')}
          >
            <div className={styles.symptomThumbWrap}>
              <img src="/images/1_2_gasping_air.png" alt="Gasping for air" className={styles.symptomThumb} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="activity" size={16} style={{ color: 'var(--blue-bright)' }} />
              <div className={styles.symptomCardTitle}>GASPING FOR AIR / SHORT OF BREATH</div>
            </div>
            <div className={styles.symptomCardDesc}>Breathing very fast, struggling to catch breath, or blue lips.</div>
          </div>

          <div
            className={`${styles.symptomCard} ${selectedSymptoms.includes('dizziness') ? styles.symptomCardActive : ''}`}
            onClick={() => toggleSymptom('dizziness')}
          >
            <div className={styles.symptomThumbWrap}>
              <img src="/images/1_3_dizzy_confused.png" alt="Dizzy / Confused" className={styles.symptomThumb} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="spark" size={16} style={{ color: 'var(--amber)' }} />
              <div className={styles.symptomCardTitle}>DIZZY / COLD SWEAT / CONFUSED</div>
            </div>
            <div className={styles.symptomCardDesc}>Pale sweaty forehead, lightheaded, blurred vision, or about to faint.</div>
          </div>

          <div
            className={`${styles.symptomCard} ${selectedSymptoms.includes('fall') ? styles.symptomCardActive : ''}`}
            onClick={() => toggleSymptom('fall')}
          >
            <div className={styles.symptomThumbWrap}>
              <img src="/images/1_4_fell_down_leg_cramps.png" alt="Fell down leg cramps" className={styles.symptomThumb} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="warning" size={16} style={{ color: 'var(--red)' }} />
              <div className={styles.symptomCardTitle}>FELL DOWN / LEG CRAMPS</div>
            </div>
            <div className={styles.symptomCardDesc}>Collapsed on the floor/ground, unable to stand, or shaking legs.</div>
          </div>

        </div>

        {/* Multimodal Voice + POCUS Upload */}
        <div className={styles.voiceRow} style={{ marginTop: '12px' }}>
          <Button
            variant={isRecording ? 'danger' : 'secondary'}
            size="sm"
            onClick={handleVoiceToggle}
          >
            <Icon name="radio" size={14} />
            {isRecording ? 'RECORDING... (TAP TO STOP)' : 'HOLD TO SPEAK (WEB SPEECH)'}
          </Button>

          <span className={styles.voiceStatus}>
            {voiceText ? `HEARD: "${voiceText}"` : recognizer?.isSupported ? 'Speak symptoms to auto-match keywords' : 'Voice API ready (use card clicks)'}
          </span>

          <Button
            variant={ultrasoundAttached ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setUltrasoundAttached(!ultrasoundAttached)}
          >
            <Icon name="scan" size={14} />
            {ultrasoundAttached ? 'POCUS ULTRASOUND ATTACHED' : 'ATTACH POCUS / CAMERA'}
          </Button>
        </div>
      </Panel>

      {/* Model C Diagnostic Verdict */}
      <Panel
        eyebrow="MODEL C // CLINICAL TRIAGE DECISION TREE"
        title="Diagnostic classification"
        action={
          <StatusBadge tone={isNominal ? 'green' : 'red'} dot>
            {isNominal
              ? 'FLIGHT SURGEONS: STANDBY'
              : triageResult?.flight_surgeons_queued
              ? 'FLIGHT SURGEONS ALERT QUEUED'
              : 'TRIAGE READY'}
          </StatusBadge>
        }
      >
        <div className={styles.verdictBox}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>PRIMARY CLASSIFICATION</div>
            <div className={styles.verdictClass} style={{ color: isNominal ? 'var(--green)' : 'var(--red)' }}>
              {primaryClass}
            </div>
          </div>

          <div className={styles.treePath}>
            {formatHumanDecisionPath(triageResult?.tree_path_why, vitals, isNominal, primaryClass)}
          </div>

          {/* Ranked other classes */}
          {triageResult?.ranked_other_classes && triageResult.ranked_other_classes.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>DIFFERENTIALS:</span>
              {triageResult.ranked_other_classes.slice(0, 3).map(r => (
                <span key={r.class_name} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-strong)', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', border: '1px solid var(--line-subtle)' }}>
                  {r.class_name} ({(r.confidence * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* 3 First-Aid Steps with Illustrated SVG Schemes & Speech Voice Readback */}
      <Panel
        eyebrow="NASA FLIGHT SURGEON DIRECTIVE"
        title="Immediate first-aid resuscitation steps"
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={handleSpeakAllSteps}>
              <Icon name="wave" size={14} />
              VOICE READBACK
            </Button>
            <Button variant="ghost" size="sm" onClick={stopSpeaking}>
              MUTE
            </Button>
          </div>
        }
      >
        <div className={styles.stepsGrid}>
          {(() => {
            const usedImages = new Set<string>();
            return triageResult?.protocol_steps && triageResult.protocol_steps.length > 0 ? (
              triageResult.protocol_steps.map(step => {
                const img = resolveStepImage(step, isNominal, usedImages);
                return (
                  <div key={step.order} className={styles.stepCard}>
                    <div className={styles.stepHeader}>
                      <span className={styles.stepOrder}>STEP 0{step.order}</span>
                    </div>
                    <div className={styles.stepTitle}>{step.title}</div>
                    <p className={styles.stepInst}>{step.instruction}</p>

                    {/* High-res semantically matched instruction photo without duplicates */}
                    {img && (
                      <div className={styles.stepImageWrap}>
                        <img src={img.src} alt={img.alt} className={styles.stepImage} />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div>Loading protocol steps...</div>
            );
          })()}
        </div>
      </Panel>

    </div>
  );
}
