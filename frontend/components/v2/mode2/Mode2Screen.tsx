'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import type { ProtocolStep, SymptomId, TriageResponse } from '../../../lib/api/types';
import { crewMeta } from '../../../lib/crew';
import { createSpeechRecognizer, speakInstruction, stopSpeaking } from '../../../lib/speech';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon, type IconName } from '../ui/icons';
import { ProgressBar, StatusPill } from '../ui/StatusPill';
import styles from './mode2.module.css';

const FALL_SECONDS = 30;

const symptoms: Array<{ id: SymptomId; title: string; desc: string; icon: IconName }> = [
  { id: 'chest_pain', title: 'Chest pain', desc: 'Pressure or tightness in the chest, may spread to arm or jaw', icon: 'heart' },
  { id: 'shortness_of_breath', title: 'Can’t breathe', desc: 'Gasping, fast shallow breathing, air hunger', icon: 'lungs' },
  { id: 'dizziness', title: 'Dizzy or fainting', desc: 'Light-headed, confused, unsteady on feet', icon: 'dizzy' },
  { id: 'fall', title: 'Fell down', desc: 'Lost balance or collapsed, may be injured', icon: 'fall' },
];

const stepIcon: Record<ProtocolStep['diagram'], IconName> = { position: 'body', oxygen: 'lungs', bay: 'list', aed: 'zap', none: 'check' };

export function Mode2Screen() {
  const { currentCrew, crew, api } = useConsole();
  const vitals = currentCrew?.vitals;

  // Fall countdown (scenario 2A)
  const [simulatedFall, setSimulatedFall] = useState(false);
  const [countdown, setCountdown] = useState(FALL_SECONDS);
  const [fallCancelled, setFallCancelled] = useState(false);

  const hasServerFall = Boolean(vitals?.fall) || (currentCrew?.fall_countdown_s ?? 0) > 0 || Boolean(currentCrew?.alarm?.reasons?.includes('fall'));
  const isFallDetected = (hasServerFall || simulatedFall) && !fallCancelled;

  useEffect(() => {
    const serverCountdown = currentCrew?.fall_countdown_s;
    if (serverCountdown !== undefined && serverCountdown !== null && serverCountdown > 0) {
      setCountdown(Math.ceil(serverCountdown));
      setFallCancelled(false);
    }
  }, [currentCrew?.fall_countdown_s]);

  useEffect(() => { if (vitals?.fall) setFallCancelled(false); }, [vitals?.fall]);

  useEffect(() => {
    if (!isFallDetected) return;
    const interval = setInterval(() => setCountdown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(interval);
  }, [isFallDetected]);

  // Intake
  const [selected, setSelected] = useState<SymptomId[]>([]);
  const [ultrasound, setUltrasound] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recognizer, setRecognizer] = useState<{ start: () => void; stop: () => void; isSupported: boolean } | null>(null);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [, startTransition] = useTransition();

  const toggleSymptom = (sym: SymptomId) => {
    setSelected(prev => {
      const on = !prev.includes(sym);
      // Push the matching sensor picture once per click (never in the 1 Hz loop).
      if (sym === 'fall') {
        setSimulatedFall(on);
        if (on) { setFallCancelled(false); setCountdown(FALL_SECONDS); }
        void api.sendSensors({ crew, fall: on });
      } else if (sym === 'chest_pain') {
        void api.sendSensors(on ? { crew, hr: 118, sys: 82, dia: 50, st: 0.286 } : { crew, hr: 74, sys: 118, dia: 76, st: 0.005 });
      } else if (sym === 'shortness_of_breath') {
        void api.sendSensors(on ? { crew, spo2: 88.0, resp: 28 } : { crew, spo2: 98.4, resp: 14 });
      }
      return on ? [...prev, sym] : prev.filter(s => s !== sym);
    });
  };

  const performTriage = useCallback(async () => {
    try {
      const chest = selected.includes('chest_pain');
      const dyspnea = selected.includes('shortness_of_breath');
      const fall = selected.includes('fall') || simulatedFall || Boolean(vitals?.fall);
      const effectiveVitals = {
        ...(vitals ?? {}),
        hr: chest ? 118 : (vitals?.hr ?? 74),
        sys: chest ? 82 : (vitals?.sys ?? 118),
        dia: chest ? 50 : (vitals?.dia ?? 76),
        st: chest ? 0.286 : (vitals?.st ?? 0.005),
        spo2: dyspnea ? 88.0 : (vitals?.spo2 ?? 98.4),
        fall,
      };
      setTriage(await api.triage({ crew, symptoms: selected, vitals: effectiveVitals, ultrasound_attached: ultrasound, text: voiceText || undefined }));
    } catch {
      // keep the previous result on a transient error
    }
  }, [api, crew, selected, ultrasound, voiceText, simulatedFall, vitals?.fall, vitals?.sys, vitals?.st, vitals?.spo2]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { startTransition(() => { void performTriage(); }); }, [performTriage]);

  useEffect(() => {
    setRecognizer(createSpeechRecognizer(
      (transcript, matched) => {
        setVoiceText(transcript);
        if (matched.length) setSelected(prev => Array.from(new Set([...prev, ...matched])));
      },
      () => setRecording(false),
    ));
  }, []);

  const toggleVoice = () => {
    if (!recognizer?.isSupported) return;
    if (recording) recognizer.stop(); else recognizer.start();
    setRecording(!recording);
  };

  const clearAll = () => {
    setSelected([]);
    setSimulatedFall(false);
    setFallCancelled(true);
    setVoiceText('');
    void api.sendSensors({ crew, hr: 74, sys: 118, dia: 76, st: 0.005, spo2: 98.4, resp: 15, fall: false });
    void api.postEvent({ type: 'ack', crew, text: 'Emergency cleared · nominal baseline restored' });
  };

  const cancelFall = async () => {
    setFallCancelled(true);
    setSimulatedFall(false);
    setSelected(prev => prev.filter(s => s !== 'fall'));
    await api.postEvent({ type: 'ack', crew, text: `Crew ${crew} conscious · confirmed on wrist · rescue cancelled` });
    void api.sendSensors({ crew, fall: false });
  };

  // Hard clinical rule: no nitroglycerin with systolic BP < 90.
  const sysBp = selected.includes('chest_pain') ? 82 : (vitals?.sys ?? 118);
  const nitroBlocked = sysBp < 90 || (triage?.dont_give_list.some(d => d.toLowerCase().includes('nitroglycerin')) ?? false);
  const otherDontGive = (triage?.dont_give_list ?? []).filter(d => !d.toLowerCase().includes('nitroglycerin'));
  const nominal = !triage || /nominal/i.test(triage.primary_class);
  const steps = triage?.protocol_steps ?? [];
  const topConfidence = triage?.ranked_other_classes?.[0]?.confidence;

  const readAloud = () => {
    if (steps.length) speakInstruction(steps.map(s => `Step ${s.order}. ${s.title}. ${s.instruction}`).join(' '));
  };

  return (
    <div className={styles.screen}>
      {isFallDetected && (
        <section className={styles.countdown} role="alert">
          <div className={styles.countdownText}>
            <span>Fall detected · {crewMeta[crew].name}</span>
            <strong className="num">{countdown}<small>s</small></strong>
            <p>{countdown > 0 ? 'until an automatic rescue call. The astronaut can cancel from the wrist display.' : 'Rescue call sent to the base and buddy. Beacon is transmitting.'}</p>
            <ProgressBar value={countdown} max={FALL_SECONDS} tone="red" label="Rescue countdown" />
          </div>
          <Button variant="danger" size="lg" icon="check" onClick={cancelFall}>I’m OK — cancel rescue</Button>
        </section>
      )}

      <div className={styles.top}>
        <Card
          title="1 · What do you see?"
          subtitle="Tap every symptom that applies, or describe it by voice."
          action={selected.length > 0 ? <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button> : undefined}
        >
          <div className={styles.symptoms}>
            {symptoms.map(s => {
              const on = selected.includes(s.id);
              return (
                <button key={s.id} type="button" className={`${styles.symptom} ${on ? styles.symptomOn : ''}`} aria-pressed={on} onClick={() => toggleSymptom(s.id)}>
                  <span className={styles.symptomIcon}><Icon name={s.icon} size={26} /></span>
                  <strong>{s.title}</strong>
                  <small>{s.desc}</small>
                  {on && <span className={styles.check}><Icon name="check" size={16} strokeWidth={2.6} /></span>}
                </button>
              );
            })}
          </div>
          <div className={styles.inputs}>
            <Button variant={recording ? 'danger' : 'secondary'} icon="mic" onClick={toggleVoice} disabled={!recognizer?.isSupported}>
              {recording ? 'Listening… tap to stop' : 'Describe by voice'}
            </Button>
            <Button variant={ultrasound ? 'primary' : 'secondary'} icon="scan" onClick={() => setUltrasound(!ultrasound)}>
              {ultrasound ? 'Ultrasound attached' : 'Attach ultrasound'}
            </Button>
            {voiceText && <p className={styles.heard}>Heard: “{voiceText}”</p>}
          </div>
        </Card>

        <Card
          title="2 · Likely cause"
          action={<StatusPill tone={triage?.flight_surgeons_queued ? 'amber' : 'neutral'}>{triage?.flight_surgeons_queued ? 'Flight surgeons alert queued' : 'Triage ready'}</StatusPill>}
          tone={nominal ? undefined : 'red'}
        >
          <div className={styles.diagnosis}>
            <strong className={nominal ? 'tone-green' : 'tone-red'}>{triage?.primary_class ?? 'Analysing…'}</strong>
            {!nominal && topConfidence !== undefined && topConfidence >= 0.05 && <span className={styles.confidence}>Next most likely: {triage?.ranked_other_classes[0].class_name} ({Math.round(topConfidence * 100)}%)</span>}
            {triage?.tree_path_why && <p className={styles.why}><b>Why:</b> {triage.tree_path_why}</p>}
          </div>
        </Card>
      </div>

      {(nitroBlocked || otherDontGive.length > 0) && (
        <section className={styles.dontGive} role="alert" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {nitroBlocked && (
            <img
              src="/images/nitro_contraindicated_aspirin.png"
              alt="Nitroglycerin Contraindicated"
              style={{ width: '160px', height: '95px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--red)', flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            {nitroBlocked && (
              <>
                <h3>Do not administer nitroglycerin</h3>
                <p>Systolic blood pressure is <b className="num">{Math.round(sysBp)} mmHg</b> (below 90). Nitroglycerin would drop it further and can cause cardiogenic shock. Administer chewable Aspirin (325 mg) instead.</p>
              </>
            )}
            {otherDontGive.length > 0 && <p className={styles.otherDont}>Also avoid: {otherDontGive.join(' · ')}</p>}
          </div>
        </section>
      )}

      <Card
        title="3 · What to do now"
        subtitle="Plain-language steps for immediate crew response."
        action={<>
          <Button variant="secondary" size="sm" icon="volume" onClick={readAloud} disabled={!steps.length}>Read aloud</Button>
          <Button variant="ghost" size="sm" icon="stop" onClick={stopSpeaking}>Stop</Button>
        </>}
      >
        {steps.length ? (
          <ol className={styles.steps}>
            {steps.map(step => (
              <li key={step.order}>
                <span className={styles.stepNum}>{step.order}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.instruction}</p>
                </div>
                <span className={styles.stepIcon}><Icon name={stepIcon[step.diagram] ?? 'check'} size={22} /></span>
              </li>
            ))}
          </ol>
        ) : <p className={styles.empty}>No action needed. Keep monitoring.</p>}
      </Card>
    </div>
  );
}
