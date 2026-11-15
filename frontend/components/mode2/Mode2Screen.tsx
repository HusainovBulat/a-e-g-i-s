'use client';

export type UltrasoundCase = 'nominal' | 'ischemia' | 'tamponade';

export const ULTRASOUND_DATA: Record<UltrasoundCase, {
  id: UltrasoundCase;
  name: string;
  badge: string;
  tone: 'green' | 'red' | 'amber';
  image: string;
  finding: string;
  aiExplanation: string;
  diagnosis: string;
}> = {
  nominal: {
    id: 'nominal',
    name: 'Normal 4-Chamber (Baseline)',
    badge: 'CARDIAC PATHOLOGY EXCLUDED',
    tone: 'green',
    image: '/images/ultrasound_nominal.png',
    finding: 'Symmetric 4-chamber kinetics · LVEF ~65% · Zero pericardial effusion.',
    aiExplanation: 'POCUS rules out acute infarction & tamponade. Chest tightness diagnosed as severe EVA musculoskeletal strain.',
    diagnosis: 'EVA Musculoskeletal Exertion (Cardiac Excluded)',
  },
  ischemia: {
    id: 'ischemia',
    name: 'Apical Wall Hypokinesis (Ischemia)',
    badge: 'ISCHEMIA CONFIRMED · 98% ACCURACY',
    tone: 'red',
    image: '/images/ultrasound_ischemia.png',
    finding: 'Anterior LV wall hypokinesia · ST telemetry concordant · Zero effusion.',
    aiExplanation: 'POCUS confirms Acute Coronary Ischemia. Chewable Aspirin 325 mg protocol authorized. Nitroglycerin blocked if BP < 90.',
    diagnosis: 'Acute Coronary Ischemia (POCUS Confirmed)',
  },
  tamponade: {
    id: 'tamponade',
    name: 'Pericardial Fluid Band (Tamponade)',
    badge: 'CRITICAL ALERT · TAMPONADE EFFUSION',
    tone: 'red',
    image: '/images/ultrasound_tamponade.png',
    finding: 'Circumferential anechoic pericardial fluid band (>15 mm) with RV diastolic collapse.',
    aiExplanation: 'CARDIAC TAMPONADE / HEMOPERICARDIUM RISK. ⛔ NEVER GIVE ASPIRIN OR NITROGLYCERIN. Immediate pericardiocentesis evacuation protocol.',
    diagnosis: 'Cardiac Tamponade / Pericardial Effusion Risk',
  },
};

function formatHumanDecisionPath(
  rawPath: string | null | undefined,
  vitals: any,
  isNominal: boolean,
  primaryClass: string,
  ultrasoundAttached?: boolean,
  ultrasoundCase?: UltrasoundCase
): string {
  if (ultrasoundAttached && ultrasoundCase) {
    if (ultrasoundCase === 'tamponade') {
      return 'Why: POCUS ultrasound revealed circumferential pericardial effusion (>15 mm) with RV diastolic collapse → Cardiac Tamponade Emergency. Aspirin & Nitroglycerin hard contraindicated to avoid fatal internal hemorrhage. Immediate emergency pericardiocentesis evacuation.';
    }
    if (ultrasoundCase === 'nominal') {
      return 'Why: POCUS ultrasound verified symmetric 4-chamber contraction and zero pericardial effusion (EF ~65%) → Acute myocardial infarction and tamponade ruled out. Chest tightness diagnosed as severe EVA musculoskeletal strain / chest-wall spasm.';
    }
    if (ultrasoundCase === 'ischemia') {
      return 'Why: POCUS ultrasound confirmed acute anterior LV wall hypokinesis. ST-segment elevation telemetry verified → Acute Coronary Ischemia confirmed with 98% clinical confidence.';
    }
  }

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

  if (pLower.includes('decompression') || pLower.includes('dcs')) {
    return `Why: Joint pain and sudden chamber pressure drop detected → Decompression Sickness (Bends)`;
  }

  if (pLower.includes('head') || pLower.includes('tbi') || pLower.includes('concussion')) {
    return `Why: Helmet impact telemetry registered with disorientation → Acute Concussion Protocol`;
  }

  if (pLower.includes('carbon') || pLower.includes('co2') || pLower.includes('hypercapnia')) {
    return `Why: Suit scrubber saturation causing elevated arterial CO2 → Hypercapnia Scrubber Flush`;
  }

  if (rawPath) {
    return rawPath
      .replace(/Step \d+:\s*/gi, '')
      .replace(/Leaf reached:\s*/gi, 'Verdict: ')
      .replace(/Decision tree path:\s*/gi, 'Clinical diagnosis path: ')
      .replace(/non-doctor/gi, 'crew peer')
      .replace(/non doctor/gi, 'crew peer');
  }

  return `Why: Automated clinical triage evaluated vital sensors and clinical presentation → ${primaryClass}`;
}

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useConsole } from '../../lib/ConsoleProvider';
import { Button } from '../ui/Button';
import { Icon } from '../ui/icons';
import { Panel } from '../ui/Panel';
import { StatusBadge } from '../ui/StatusBadge';
import {
  createSpeechRecognizer,
  preloadVoskModel,
  speakInstruction,
  stopSpeaking,
  subscribeVoskModel,
  usesOfflineVoiceModel,
  type VoskLoadState,
} from '../../lib/speech';
import { useEmergencyStore, emergencyStore } from '../../lib/emergencyStore';
import type { ProtocolStep, SymptomId, TriageResponse } from '../../lib/api/types';
import styles from './mode2.module.css';

function resolveStepImage(step: { title: string; instruction: string; order?: number }, isNominal: boolean, usedImages: Set<string>): { src: string; alt: string } | null {
  const fullText = `${step.title} ${step.instruction}`.toLowerCase();

  // If the crewmember is healthy / nominal, show routine check-in & monitoring photos
  if (isNominal) {
    if (!usedImages.has('nominal1')) {
      usedImages.add('nominal1');
      return { src: '/images/nominal_step1_maintain_monitoring.png', alt: 'Wrist Telemetry: All Systems Nominal' };
    }
    if (!usedImages.has('nominal2')) {
      usedImages.add('nominal2');
      return { src: '/images/nominal_step2_routine_eva_tasks.png', alt: 'Suit HUD: Proceed with Routine EVA' };
    }
    if (!usedImages.has('nominal3')) {
      usedImages.add('nominal3');
      return { src: '/images/nominal_step3_regular_checkin.png', alt: 'Crew Check-in: Continuous Monitoring' };
    }
    return { src: '/images/nominal_step1_maintain_monitoring.png', alt: 'Nominal EVA Monitoring' };
  }

  // 1. AED / Defibrillator / CPR
  if (fullText.includes('aed') || fullText.includes('defib') || fullText.includes('cpr') || fullText.includes('compress') || fullText.includes('shock')) {
    if (!usedImages.has('aed')) {
      usedImages.add('aed');
      return { src: '/images/2_3_step3_defibrillator_pads.png', alt: 'Automated External Defibrillator (AED) & Resuscitation' };
    }
  }

  // 2. Medication / Chewable aspirin / Drug delivery
  if (fullText.includes('aspirin') || fullText.includes('chew') || fullText.includes('pill') || fullText.includes('medication') || fullText.includes('mg') || fullText.includes('nitroglycerin')) {
    if (!usedImages.has('aspirin')) {
      usedImages.add('aspirin');
      return { src: '/images/nitro_contraindicated_aspirin.png', alt: 'Chewable Aspirin 325 mg Protocol' };
    }
  }

  // 3. Posture / Semi-sitting / Supine / Rest / Elevation / Calm
  if (fullText.includes('posture') || fullText.includes('semi-sitting') || fullText.includes('supine') || fullText.includes('elevat') || fullText.includes('rest') || fullText.includes('lie') || fullText.includes('calm') || (fullText.includes('position') && !fullText.includes('sampling'))) {
    if (!usedImages.has('position')) {
      usedImages.add('position');
      return { src: '/images/2_1_step1_position_casualty.png', alt: 'Calm Rest & Assisted Posture Position' };
    }
  }

  // 4. Suit repressurization / Pressure sealing / Suit valve / PLSS scrubber / LiOH
  if (fullText.includes('pressur') || fullText.includes('suit') || fullText.includes('seal') || fullText.includes('psi') || fullText.includes('repressurize') || fullText.includes('scrubber') || fullText.includes('lioh')) {
    if (!usedImages.has('suit')) {
      usedImages.add('suit');
      return { src: '/images/step2_repressurize_suit.png', alt: 'Repressurize Suit & Verify Pressure Sealing' };
    }
  }

  // 5. Oxygen / Purge / Normobaric / Mask / Breathing loop / 100%
  if (fullText.includes('normobaric') || fullText.includes('oxygen') || fullText.includes('purge') || fullText.includes('o2') || fullText.includes('mask') || fullText.includes('umbilical') || fullText.includes('100%')) {
    if (!usedImages.has('oxygen')) {
      usedImages.add('oxygen');
      return { src: '/images/step3_normobaric_oxygen.png', alt: 'Administer 100% High-Flow Normobaric Oxygen' };
    }
  }

  // 6. Lower body compression / Leg cramps / Calf massage / Compression cuffs
  if (fullText.includes('compression') || fullText.includes('cuff') || fullText.includes('cramp') || fullText.includes('calf') || fullText.includes('massage') || fullText.includes('stretch')) {
    if (!usedImages.has('compression')) {
      usedImages.add('compression');
      return { src: '/images/3_2_quest2_leg_compression.png', alt: 'Calf Massage and Leg Compression Countermeasure' };
    }
  }

  // 7. Electrolyte rehydration / Fluid
  if (fullText.includes('electrolyte') || fullText.includes('rehydration') || fullText.includes('hydration') || fullText.includes('fluid') || fullText.includes('water') || fullText.includes('drink')) {
    if (!usedImages.has('hydration')) {
      usedImages.add('hydration');
      return { src: '/images/3_1_quest1_electrolyte_rehydration.png', alt: 'Oral Isotonic Electrolyte Rehydration' };
    }
  }

  // 8. Resonant breathing / Respiration
  if (fullText.includes('resonant') || fullText.includes('breathing') || fullText.includes('respiration')) {
    if (!usedImages.has('breathing')) {
      usedImages.add('breathing');
      return { src: '/images/3_3_quest3_resonant_breathing.png', alt: 'Resonant Breathing Protocol' };
    }
  }

  // 9. Hyperbaric chamber / Airlock evacuation
  if (fullText.includes('hyperbaric') || fullText.includes('airlock') || fullText.includes('chamber') || fullText.includes('evacuat')) {
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

  // Global persistent emergency state across tabs
  const emergency = useEmergencyStore(crew);
  const selectedSymptoms = emergency.selectedSymptoms;
  const simulatedFall = emergency.simulatedFall;
  const simulatedHypoxia = emergency.simulatedHypoxia;
  const fallCancelled = emergency.fallCancelled;
  const hypoxiaCancelled = emergency.hypoxiaCancelled;
  const countdown = emergency.countdown;
  const isLocked = emergency.isLocked;
  const lockType = emergency.lockType;

  const [ultrasoundAttached, setUltrasoundAttached] = useState<boolean>(false);
  const [ultrasoundCase, setUltrasoundCase] = useState<UltrasoundCase>('ischemia');
  const [voiceText, setVoiceText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recognizer, setRecognizer] = useState<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceModel, setVoiceModel] = useState<VoskLoadState | null>(null);
  const voiceInitializing = voiceModel?.status === 'loading';

  const toggleUltrasound = () => {
    if (!ultrasoundAttached) {
      // Pick a random case on attach (preferring a different one each time for demo variety)
      const cases: UltrasoundCase[] = ['ischemia', 'nominal', 'tamponade'];
      const candidates = cases.filter(c => c !== ultrasoundCase);
      const picked = candidates[Math.floor(Math.random() * candidates.length)] || cases[0];
      setUltrasoundCase(picked);
      setUltrasoundAttached(true);
    } else {
      setUltrasoundAttached(false);
    }
  };

  const hasServerFall = Boolean(vitals?.fall) || (currentCrew?.fall_countdown_s !== undefined && currentCrew?.fall_countdown_s !== null && currentCrew.fall_countdown_s > 0) || Boolean(currentCrew?.alarm?.reasons?.includes('fall'));
  const isFallDetected = (hasServerFall || simulatedFall || selectedSymptoms.includes('fall')) && !fallCancelled;

  const hasServerHypoxia = (vitals?.spo2 !== undefined && vitals.spo2 < 92) || Boolean(currentCrew?.alarm?.reasons?.some(r => /hypox|spo2/i.test(r)));
  const isHypoxiaDetected = (hasServerHypoxia || simulatedHypoxia || selectedSymptoms.includes('shortness_of_breath')) && !hypoxiaCancelled;

  const isEmergencyActive = isFallDetected || isHypoxiaDetected;
  const currentEmergencyType: 'fall' | 'hypoxia' = isFallDetected ? 'fall' : 'hypoxia';

  // Automatically start persistent emergency if detected and not already started or locked
  useEffect(() => {
    if (isEmergencyActive && !isLocked && emergency.emergencyStartTs === null) {
      emergencyStore.startEmergency(crew, currentEmergencyType);
    }
  }, [isEmergencyActive, isLocked, emergency.emergencyStartTs, currentEmergencyType, crew]);

  // Sync server countdown or server lock
  useEffect(() => {
    if (currentCrew?.fall_countdown_s !== undefined && currentCrew?.fall_countdown_s !== null) {
      if (currentCrew.fall_countdown_s > 0) {
        emergencyStore.startEmergency(crew, 'fall');
      } else if (currentCrew.fall_countdown_s === 0) {
        emergencyStore.lock(crew, 'fall');
      }
    }
    if (currentCrew?.alarm?.reasons?.includes('fall_no_ack')) {
      emergencyStore.lock(crew, 'fall');
    }
  }, [currentCrew?.fall_countdown_s, currentCrew?.alarm?.reasons, crew]);

  // If vitals.fall turns true from phone
  useEffect(() => {
    if (vitals?.fall && !fallCancelled) {
      emergencyStore.startEmergency(crew, 'fall');
    }
  }, [vitals?.fall, fallCancelled, crew]);

  // If vitals.spo2 < 92 from phone
  useEffect(() => {
    if (vitals?.spo2 !== undefined && vitals.spo2 < 92 && !hypoxiaCancelled) {
      emergencyStore.startEmergency(crew, 'hypoxia');
    }
  }, [vitals?.spo2, hypoxiaCancelled, crew]);

  // Triage state
  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);
  const [, startTransition] = useTransition();

  const toggleSymptom = (sym: SymptomId) => {
    const prev = selectedSymptoms;
    const willEnable = !prev.includes(sym);
    const next = willEnable ? [...prev, sym] : prev.filter(s => s !== sym);
    emergencyStore.update(crew, { selectedSymptoms: next });
    
    // Update sensor simulation strictly on user toggle click (never in a 1Hz loop)
    if (sym === 'fall') {
      if (willEnable) {
        emergencyStore.update(crew, { simulatedFall: true, fallCancelled: false });
        emergencyStore.startEmergency(crew, 'fall');
        void api.sendSensors({ crew, fall: true });
      } else {
        emergencyStore.update(crew, { simulatedFall: false });
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
        emergencyStore.update(crew, { simulatedHypoxia: true, hypoxiaCancelled: false });
        emergencyStore.startEmergency(crew, 'hypoxia');
        void api.sendSensors({ crew, spo2: 88.0, resp: 28 });
      } else {
        emergencyStore.update(crew, { simulatedHypoxia: false });
        void api.sendSensors({ crew, spo2: 98.4, resp: 14 });
      }
    }
  };

  // Perform Triage on API
  const performTriage = useCallback(async () => {
    try {
      const hasChestPain = selectedSymptoms.includes('chest_pain');
      const hasDyspnea = selectedSymptoms.includes('shortness_of_breath') || simulatedHypoxia || (vitals?.spo2 !== undefined && vitals.spo2 < 92);
      const hasFall = selectedSymptoms.includes('fall') || simulatedFall || Boolean(vitals?.fall);

      // Construct effective vitals for triage classification
      const effectiveVitals = {
        ...(vitals ?? {}),
        hr: hasChestPain ? 118 : (vitals?.hr ?? 74),
        sys: hasChestPain ? 82 : (vitals?.sys ?? 118),
        dia: hasChestPain ? 50 : (vitals?.dia ?? 76),
        st: hasChestPain ? 0.286 : (vitals?.st ?? 0.005),
        spo2: hasDyspnea ? (vitals?.spo2 !== undefined && vitals.spo2 < 92 ? vitals.spo2 : 88.0) : (vitals?.spo2 ?? 98.4),
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
  }, [api, crew, selectedSymptoms, vitals, ultrasoundAttached, voiceText, simulatedFall, simulatedHypoxia]);

  useEffect(() => {
    startTransition(() => {
      void performTriage();
    });
  }, [performTriage]);

  // Speech Recognition Intake
  useEffect(() => {
    const rec = createSpeechRecognizer(
      (transcript, matched) => {
        setVoiceText(transcript);
        if (matched.length > 0) {
          emergencyStore.update(crew, {
            selectedSymptoms: Array.from(new Set([...selectedSymptoms, ...matched])),
          });
        }
      },
      () => setIsRecording(false),
      setVoiceStatus
    );
    setRecognizer(rec);
    // Firefox < 160: show the offline model initialisation (preloading starts with the page).
    if (!usesOfflineVoiceModel()) return;
    const unsubscribe = subscribeVoskModel(setVoiceModel);
    preloadVoskModel().catch(() => {});
    return unsubscribe;
  }, [selectedSymptoms, crew]);

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
    emergencyStore.update(crew, {
      selectedSymptoms: ['chest_pain', 'dizziness'],
      simulatedFall: false,
      simulatedHypoxia: false,
    });
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
    emergencyStore.update(crew, {
      selectedSymptoms: ['fall', 'dizziness'],
      simulatedFall: true,
      simulatedHypoxia: false,
      fallCancelled: false,
    });
    emergencyStore.startEmergency(crew, 'fall');
    void api.sendSensors({
      crew,
      fall: true,
      hr: 98,
    });
  };

  const triggerHypoxiaScenario = () => {
    emergencyStore.update(crew, {
      selectedSymptoms: ['shortness_of_breath', 'dizziness'],
      simulatedFall: false,
      simulatedHypoxia: true,
      hypoxiaCancelled: false,
    });
    emergencyStore.startEmergency(crew, 'hypoxia');
    void api.sendSensors({
      crew,
      spo2: 88.0,
      resp: 28,
      fall: false,
    });
  };

  const triggerRestoreNominal = () => {
    emergencyStore.reset(crew);
    setUltrasoundAttached(false);
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

  const handleCancelEmergency = async () => {
    emergencyStore.reset(crew);
    await api.postEvent({
      type: 'ack',
      crew,
      text: `CREW ${crew} CONSCIOUS · WRIST ACKNOWLEDGED · RESCUE ABORTED`,
    });
    void api.sendSensors({ crew, fall: false, spo2: 98.4, resp: 15 });
  };

  // Critical Hard Rules: Nitroglycerin Ban & Oxygen Surge
  const hasChestPain = selectedSymptoms.includes('chest_pain');
  const sysBp = hasChestPain ? 82 : (vitals?.sys ?? 118);
  const isTamponade = ultrasoundAttached && ultrasoundCase === 'tamponade';
  const isNitroBlocked = sysBp < 90 || isTamponade || (triageResult?.dont_give_list.some(d => d.toLowerCase().includes('nitroglycerin')) ?? false);

  const hasEmergencyAlarm = isLocked || isFallDetected || isHypoxiaDetected;
  const rawPrimaryClass = triageResult?.primary_class ?? (selectedSymptoms.length > 0 || hasEmergencyAlarm ? (isFallDetected ? 'Postural Collapse' : isHypoxiaDetected ? 'Severe Hypoxia & Decompression Risk' : 'Acute Coronary Ischemia') : 'Nominal');
  
  const primaryClass = ultrasoundAttached ? ULTRASOUND_DATA[ultrasoundCase].diagnosis : rawPrimaryClass;
  const isNominal = !hasEmergencyAlarm && (!ultrasoundAttached || ultrasoundCase === 'nominal') && rawPrimaryClass.toLowerCase() === 'nominal';

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
        <Button variant={isHypoxiaDetected ? 'danger' : 'secondary'} size="sm" onClick={triggerHypoxiaScenario}>
          🫁 HYPOXIA (SpO₂ &lt; 92%)
        </Button>
        <Button variant={isLocked ? 'danger' : 'ghost'} size="sm" onClick={triggerRestoreNominal}>
          🟢 RESTORE NOMINAL (CLEAR)
        </Button>
      </div>

      {/* Persistent High-Contrast Red Lock-in Banner (REMAINS ON SCREEN INDEFINITELY until Clear/Reset) */}
      {isLocked && (
        <div className={styles.lockedEmergencyBanner} role="alert">
          <div className={styles.lockedBannerHeader}>
            <div className={styles.lockedBannerTitle}>
              {lockType === 'fall'
                ? '🚨 30s OVERRIDE EXPIRED — NO CREW RESPONSE COLLAPSE DETECTED. AUTONOMOUS LIFE-SUPPORT ENGAGED: [1] 100% O₂ High-Flow Purge Active (SpO₂ < 92% & CO₂ Flush) · [2] Suboccipital Peltier Cold Shock (+10°C) Active · [3] FES Calf Venous Compression Active · [4] UHF/UWB SOS Beacon Locked (↗ 34m) & Telemetry Sent to Flight Surgeons. Status locked until manual Reset.'
                : '🚨 30s OVERRIDE EXPIRED — HYPOXIA & UNCONSCIOUSNESS PROTOCOL LOCKED: [1] 100% O2 Surge & Helmet CO2 Purge Active (SpO2 < 92%) · [2] Peltier Neck Cooling (+10°C) Active · [3] FES Leg Compression Pumping Blood to Brain · [4] UWB SOS Beacon Broadcasting (↗ 34m) & Alert Sent to Ground Flight Surgeons. Locked until manual Reset.'}
            </div>
            <div className={styles.lockedBannerActions}>
              <Button variant="danger" size="sm" onClick={triggerRestoreNominal}>
                RESTORE NOMINAL (CLEAR) / RESET
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scenario 2A/2B Countdown Box (30s) while counting down */}
      {!isLocked && isEmergencyActive && (
        <div className={styles.countdownBox}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--red)', letterSpacing: '0.1em' }}>
            {currentEmergencyType === 'fall'
              ? '🚨 CREW INACTIVITY DETECTED // AUTOMATIC RESCUE TELEMETRY'
              : '🚨 CRITICAL HYPOXIA DETECTED (SpO₂ < 92%) // NEURO-PROTECTION OVERRIDE'}
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
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '540px', textAlign: 'center' }}>
            {currentEmergencyType === 'fall'
              ? `Suit autonomous protocol will engage base rescue dispatch in ${countdown} seconds unless manually overridden.`
              : `Autonomous 100% O₂ high-flow purge and brain perfusion protocol will lock in ${countdown} seconds unless manually overridden.`}
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <Button variant="danger" size="md" onClick={handleCancelEmergency}>
              <Icon name="close" size={16} />
              I AM CONSCIOUS // CANCEL OVERRIDE (FALSE ALARM)
            </Button>
          </div>
        </div>
      )}

      {/* Suit 4 Automations Status Bar: Highlighted active green/amber during locked state until Clear */}
      <div className={styles.autoSystemGrid}>
        <div className={`${styles.autoSystemCard} ${isLocked ? styles.systemActiveGreen : ''}`}>
          <span>100% O₂ BLAST</span>
          <strong style={{ color: isNominal && !isLocked ? 'var(--text-muted)' : 'var(--green)' }}>
            {isLocked ? 'ACTIVE · 100% HIGH-FLOW PURGE' : isNominal ? 'STANDBY' : 'ARMED (HYPERBARIC PURGE)'}
          </strong>
        </div>
        <div className={`${styles.autoSystemCard} ${isLocked ? styles.systemActiveAmber : ''}`}>
          <span>EMERGENCY CORE HEATING</span>
          <strong style={{ color: isNominal && !isLocked ? 'var(--text-muted)' : isLocked ? '#F59E0B' : 'var(--green)' }}>
            {isLocked ? 'ACTIVE · PELTIER (+10°C) & LCVG' : isNominal ? 'STANDBY' : 'ACTIVE (+3.5°C LCVG LOOP)'}
          </strong>
        </div>
        <div className={`${styles.autoSystemCard} ${isLocked ? styles.systemActiveGreen : ''}`}>
          <span>BASE BURST TELEMETRY</span>
          <strong style={{ color: isNominal && !isLocked ? 'var(--text-muted)' : 'var(--green)' }}>
            {isLocked ? 'ACTIVE · 256 KBPS UWB BURST' : isNominal ? 'STANDBY' : 'UPLINK 100% (BASE + ORBIT)'}
          </strong>
        </div>
        <div className={`${styles.autoSystemCard} ${isLocked ? styles.systemActiveAmber : ''}`}>
          <span>EVACUATION BEACON</span>
          <strong style={{ color: isNominal && !isLocked ? 'var(--text-muted)' : isLocked ? '#F59E0B' : 'var(--green)' }}>
            {isLocked ? 'ACTIVE · UHF/UWB SOS ↗ 34m' : isNominal ? 'STANDBY' : 'BROADCASTING (↗ 34 M)'}
          </strong>
        </div>
      </div>

      {/* Cardiac Tamponade Emergency Interlock Banner */}
      {isTamponade && (
        <div className={styles.nitroBanner} role="alert" style={{ borderColor: 'var(--red)', background: 'rgba(239, 68, 68, 0.12)' }}>
          <Icon name="warning" size={24} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className={styles.nitroTitle} style={{ color: 'var(--red)' }}>
              🚨 CRITICAL POCUS TAMPONADE INTERLOCK: NEVER ADMINISTER ASPIRIN OR NITROGLYCERIN!
            </div>
            <div className={styles.nitroDesc}>
              Circumferential pericardial fluid band detected. Administration of vasodilators or antiplatelet agents will induce irreversible cardiogenic shock and internal hemorrhage! Immediate pericardiocentesis evacuation protocol engaged.
            </div>
          </div>
        </div>
      )}

      {/* Hard Clinical Safety Interlock: Nitroglycerin Hard-Block Banner */}
      {!isTamponade && isNitroBlocked && (
        <div className={styles.nitroBanner} role="alert">
          <img
            src="/images/nitro_contraindicated_aspirin.png"
            alt="Chewable Aspirin 325mg indicated, Nitroglycerin contraindicated"
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant={isRecording ? 'danger' : 'secondary'}
              size="sm"
              onClick={handleVoiceToggle}
              disabled={voiceInitializing || (!recognizer?.isSupported && !usesOfflineVoiceModel())}
              progress={voiceInitializing ? voiceModel?.progress : undefined}
            >
              <Icon name="wave" size={14} />
              {voiceInitializing ? 'INITIALIZATION' : isRecording ? 'RECORDING VOICE...' : 'HOLD TO SPEAK'}
            </Button>
            <Button
              variant={ultrasoundAttached ? 'primary' : 'ghost'}
              size="sm"
              onClick={toggleUltrasound}
            >
              <Icon name="scan" size={14} />
              {ultrasoundAttached ? 'ULTRASOUND ATTACHED' : 'ATTACH ULTRASOUND'}
            </Button>
          </div>
        }
      >
        {voiceStatus && (
          <div style={{ marginBottom: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-subtle)', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            {voiceStatus}
          </div>
        )}
        {voiceText && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-subtle)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            <strong style={{ color: 'var(--blue-bright)' }}>VOICE TRANSCRIPT:</strong> “{voiceText}”
          </div>
        )}

        {/* POCUS Ultrasound Viewer Card */}
        {ultrasoundAttached && (
          <div style={{
            marginBottom: '14px',
            padding: '12px 14px',
            background: 'linear-gradient(180deg, rgba(6, 182, 212, 0.08) 0%, rgba(3, 7, 18, 0.95) 100%)',
            border: `1px solid ${ULTRASOUND_DATA[ultrasoundCase].tone === 'green' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: '6px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="scan" size={16} style={{ color: 'var(--blue-bright)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--blue-bright)' }}>
                  PORTABLE POCUS ULTRASOUND // BUTTERFLY iQ CARDIAC TELEMETRY
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge tone={ULTRASOUND_DATA[ultrasoundCase].tone === 'green' ? 'green' : 'red'} dot>
                  {ULTRASOUND_DATA[ultrasoundCase].badge}
                </StatusBadge>
                <Button variant="ghost" size="sm" onClick={() => setUltrasoundAttached(false)}>
                  ✕
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Scan Thumbnail */}
              <div style={{
                position: 'relative',
                width: '180px',
                height: '135px',
                background: '#000',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid rgba(6, 182, 212, 0.5)',
                flexShrink: 0,
              }}>
                <img
                  src={ULTRASOUND_DATA[ultrasoundCase].image}
                  alt={ULTRASOUND_DATA[ultrasoundCase].name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  background: 'rgba(0,0,0,0.75)',
                  padding: '2px 5px',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--blue-bright)',
                }}>
                  POCUS // 3.5 MHz
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  background: 'rgba(0,0,0,0.75)',
                  padding: '2px 5px',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: ULTRASOUND_DATA[ultrasoundCase].tone === 'green' ? '#10B981' : '#EF4444',
                }}>
                  {ultrasoundCase.toUpperCase()}
                </div>
              </div>

              {/* Clinical Details */}
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                  {ULTRASOUND_DATA[ultrasoundCase].name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-strong)', marginBottom: '4px', lineHeight: 1.4 }}>
                  <strong>FINDING:</strong> {ULTRASOUND_DATA[ultrasoundCase].finding}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                  <strong>AI TRIAGE IMPACT:</strong> {ULTRASOUND_DATA[ultrasoundCase].aiExplanation}
                </div>
              </div>
            </div>
          </div>
        )}

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


      </Panel>

      {/* NASA Medical Triage Verdict */}
      <Panel
        eyebrow="MODEL C // CLINICAL TRIAGE"
        title="Automated diagnostic verdict & reasoning"
        action={
          <StatusBadge tone={isNominal ? "green" : "red"} dot>
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
            {formatHumanDecisionPath(triageResult?.tree_path_why, vitals, isNominal, primaryClass, ultrasoundAttached, ultrasoundCase)}
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
