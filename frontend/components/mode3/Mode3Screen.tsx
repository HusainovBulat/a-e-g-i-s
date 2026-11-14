'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Controls';
import { StatusBadge } from '../ui/StatusBadge';
import { ForecastChart, Sparkline } from '../charts/Charts';
import { Icon } from '../ui/icons';
import { useConsole } from '../../lib/ConsoleProvider';
import type { CrewHistory, CrewId, EveningRequest, EveningResponse, SummaryResponse } from '../../lib/api/types';
import styles from './mode3.module.css';

const QUESTIONS = [
  {
    key: 'sleep',
    title: 'Sleep quality & restfulness',
    unit: '/ 10',
    how: 'Check actigraphy watch sleep duration and subjective awakenings.',
    why: 'Circadian desynchrony in 0g/1/6g impairs sensorimotor and cognitive throughput.',
  },
  {
    key: 'energy',
    title: 'Energy level & vigilance',
    unit: '/ 10',
    how: 'Assess subjective stamina relative to daytime EVA exertion.',
    why: 'Identifies psychological over-estimation or physiological masking.',
  },
  {
    key: 'mood',
    title: 'Mood & isolation comfort',
    unit: '/ 10',
    how: 'Self-evaluate stress, confinement comfort, and team collaboration.',
    why: 'NASA-STD-3001 psychological standards for isolated closed environments.',
  },
  {
    key: 'pain_free',
    title: 'Pain-free muscle & joint state',
    unit: '/ 10',
    how: 'Rate absence of quadriceps soreness or lumbar spine loading aches.',
    why: 'Spinal elongation in reduced gravity causes localized muscular fatigue.',
  },
  {
    key: 'nutrition',
    title: 'Hydration & nutrition balance',
    unit: '/ 10',
    how: 'Compare daily fluid intake against target 2.5 L and caloric burn.',
    why: 'Hypovolemia precipitates orthostatic syncope upon rover or habitat entry.',
  },
] as const;

const RECOVERY_QUESTS = [
  {
    id: 'hydration',
    title: 'Electrolyte Saline Hydration',
    desc: '500 mL oral isotonic electrolyte replenishment',
    bonus: 15,
  },
  {
    id: 'compression',
    title: 'Pneumatic Calf Compression',
    desc: '40 min soleus pneumatic compression & FES myostimulation',
    bonus: 18,
  },
  {
    id: 'breathing',
    title: 'Guided Breathing & Cortisol Reset',
    desc: '10 min autonomic down-regulation & vagal tone reset',
    bonus: 20,
  },
] as const;

interface CommanderDecision {
  action: 'reassign' | 'clear';
  title: string;
  desc: string;
  tone: 'green' | 'amber' | 'red';
}

function parseInlineFormatting(str: string): React.ReactNode {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    const subParts = part.split(/(`[^`]+`)/g);
    return subParts.map((sub, j) => {
      if (sub.startsWith('`') && sub.endsWith('`')) {
        return (
          <code
            key={`${i}-${j}`}
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'rgba(255,255,255,0.06)',
              padding: '1px 5px',
              border: '1px solid var(--line-subtle)',
              color: 'var(--text-strong)',
            }}
          >
            {sub.slice(1, -1)}
          </code>
        );
      }
      return sub;
    });
  });
}

function renderMarkdownSummary(text: string) {
  if (!text) return null;

  const clean = text
    .replace(/\$\\ge\s*([0-9.]+)\$/g, '≥ $1')
    .replace(/\$\\text\{SmO\}_2\s*=\s*([0-9.]+\\%)\$/g, 'SmO₂ = $1')
    .replace(/\$\\Delta\s*=\s*([^$]+)\$/g, 'Δ = $1')
    .replace(/\$([0-9.]+)\$/g, '$1');

  const lines = clean.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: 1.55 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} style={{ height: '3px' }} />;

        if (trimmed.startsWith('### ')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--blue-bright)',
                borderBottom: '1px solid var(--line-subtle)',
                paddingBottom: '4px',
                marginTop: '4px',
                letterSpacing: '0.04em',
              }}
            >
              {trimmed.replace(/^###\s*/, '')}
            </div>
          );
        }

        if (trimmed.startsWith('**⚠️') || trimmed.includes('DISQUALIFICATION') || trimmed.includes('PROHIBITED')) {
          return (
            <div
              key={idx}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderLeft: '3px solid var(--red)',
                padding: '6px 10px',
                fontSize: '11px',
                color: 'var(--text-strong)',
              }}
            >
              {parseInlineFormatting(trimmed)}
            </div>
          );
        }

        if (trimmed.startsWith('**📖') || trimmed.startsWith('**🎯')) {
          return (
            <div
              key={idx}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-strong)',
                marginTop: '4px',
              }}
            >
              {parseInlineFormatting(trimmed)}
            </div>
          );
        }

        if (/^(\d+\.|\*|•)\s+/.test(trimmed)) {
          const content = trimmed.replace(/^(\d+\.|\*|•)\s+/, '');
          return (
            <div key={idx} style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '8px' }}>
              <span style={{ color: 'var(--blue-bright)', fontFamily: 'var(--font-mono)' }}>▸</span>
              <span>{parseInlineFormatting(content)}</span>
            </div>
          );
        }

        return (
          <p key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
            {parseInlineFormatting(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export function Mode3Screen() {
  const { currentCrew, crew, api } = useConsole();

  // Active step: 0 to 4 (questions), or 5 (results review)
  const [activeStep, setActiveStep] = useState<number>(0);

  // 5 Subjective Answers (0..10)
  const [answers, setAnswers] = useState({
    sleep: 8,
    energy: 8,
    mood: 8,
    pain_free: 7,
    nutrition: 8,
  });

  // Clinical biometrics
  const [bloodSugar, setBloodSugar] = useState<number>(104);
  const [bpSys, setBpSys] = useState<number>(118);
  const [bpDia, setBpDia] = useState<number>(76);
  const [bodyTemp, setBodyTemp] = useState<number>(36.8);

  // Selected Quests
  const [selectedQuests, setSelectedQuests] = useState<string[]>([]);

  // API Responses
  const [eveningResult, setEveningResult] = useState<EveningResponse | null>(null);
  const [summaryResult, setSummaryResult] = useState<SummaryResponse | null>(null);
  const [crewHistory, setCrewHistory] = useState<CrewHistory | null>(null);

  // Commander Decisions STORED PER CREW
  const [crewDecisions, setCrewDecisions] = useState<Record<CrewId, CommanderDecision | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });

  const [, startTransition] = useTransition();

  // Load Crew History (14 Sols) and sync crew-specific baselines
  useEffect(() => {
    let cancelled = false;
    void api.getCrewHistory(crew).then(historyData => {
      if (cancelled) return;
      setCrewHistory(historyData);
      const sol14 = historyData?.history?.[historyData.history.length - 1];
      if (sol14) {
        setAnswers({
          sleep: sol14.subjective_sleep_slider ?? 8,
          energy: sol14.subjective_energy_slider ?? 8,
          mood: sol14.subjective_mood_slider ?? 8,
          pain_free: sol14.subjective_pain_free_slider ?? 7,
          nutrition: sol14.subjective_nutrition_slider ?? 8,
        });
        if (sol14.blood_sugar_mgdl) setBloodSugar(Math.round(sol14.blood_sugar_mgdl));
        if (sol14.body_temp_c) setBodyTemp(Number(sol14.body_temp_c.toFixed(1)));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api, crew]);

  const fatigueScore = Math.round(currentCrew?.model_a?.fatigue_score ?? 40);

  // Submit / Update Evening Check-in
  const updateEvening = useCallback(async () => {
    try {
      const req: EveningRequest = {
        crew,
        answers,
        blood_sugar_mgdl: bloodSugar,
        bp_sys: bpSys,
        bp_dia: bpDia,
        body_temp_c: bodyTemp,
        fatigue_score: fatigueScore,
        quest_ids: selectedQuests,
      };
      const res = await api.evening(req);
      setEveningResult(res);
    } catch {
      // ignore
    }
  }, [api, crew, answers, bloodSugar, bpSys, bpDia, bodyTemp, fatigueScore, selectedQuests]);

  useEffect(() => {
    startTransition(() => {
      void updateEvening();
    });
  }, [updateEvening]);

  // Debounced summary briefing to eliminate re-render jitter
  useEffect(() => {
    if (!eveningResult) return;
    const timer = setTimeout(async () => {
      try {
        const sum = await api.summary(eveningResult);
        setSummaryResult(sum);
      } catch {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [api, eveningResult]);

  const toggleQuest = (qId: string) => {
    setSelectedQuests(prev =>
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  // Commander Directives (Decision rests solely with Commander)
  const handleReassign = async () => {
    const decision: CommanderDecision = {
      action: 'reassign',
      title: 'COMMANDER DECISION: SCHEDULE SWAP APPROVED (REASSIGNED TO REST)',
      desc: `Commander approved AI advisory: Crew ${crew} is reassigned to rest and recovery protocol. Backup crew assigned for next EVA.`,
      tone: 'red',
    };
    await api.postEvent({
      type: 'commander_decision',
      crew,
      text: `COMMANDER DIRECTIVE: Crew ${crew} REASSIGNED TO REST. Standby backup assigned for next EVA.`,
    });
    setCrewDecisions(prev => ({ ...prev, [crew]: decision }));
  };

  const handleClearForEva = async () => {
    const decision: CommanderDecision = {
      action: 'clear',
      title: 'COMMANDER OVERRIDE: CLEARED FOR SURFACE SORTIE',
      desc: `Commander exercised operational command authority to clear Crew ${crew} for planned lunar EVA traverse sortie.`,
      tone: 'green',
    };
    await api.postEvent({
      type: 'commander_decision',
      crew,
      text: `COMMANDER DIRECTIVE: Crew ${crew} CLEARED FOR EVA SORTIE (COMMANDER OVERRIDE).`,
    });
    setCrewDecisions(prev => ({ ...prev, [crew]: decision }));
  };

  const handleResetDecision = () => {
    setCrewDecisions(prev => ({ ...prev, [crew]: null }));
  };

  const currentQ = QUESTIONS[activeStep] ?? QUESTIONS[0];
  const readiness = eveningResult?.readiness_score ?? 78;
  const isMismatch = eveningResult?.mismatch_detected ?? false;
  const activeDecision = crewDecisions[crew];

  return (
    <div className={styles.screen}>
      
      {/* Top Header */}
      <div className={styles.topHeader}>
        <div className={styles.headerLeft}>
          <Icon name="scan" size={16} />
          <span>DAILY EVENING SUMMARY & COMMANDER ROTATION BRIEFING · CREW {crew}</span>
        </div>
        <Button
          variant={activeStep === 5 ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setActiveStep(activeStep === 5 ? 0 : 5)}
        >
          {activeStep === 5 ? 'EDIT 5-STEP ANSWERS' : 'REVIEW RESULTS & DIRECTIVES'}
        </Button>
      </div>

      {/* Masking Banner */}
      {isMismatch && (
        <div className={styles.maskingBanner}>
          <Icon name="warning" size={24} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <div>
            <div className={styles.maskingTitle}>
              ⚠️ MASKING BEHAVIOR DETECTED // FLIGHT SURGEON INTERVENTION
            </div>
            <div className={styles.maskingDesc}>
              {eveningResult?.mismatch_text ??
                'Mismatch Detected: Subjective self-report contradicts objective smart base-layer telemetry by ≥ 30 points.'}
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className={styles.layoutGrid}>
        
        {/* Left Column: 5 Questions OR Review */}
        <div className={styles.leftCol}>
          {activeStep < 5 ? (
            <Panel
              eyebrow={`STEP 0${activeStep + 1} OF 05`}
              title={currentQ.title}
              action={
                <StatusBadge tone="blue">
                  {answers[currentQ.key as keyof typeof answers]} / 10
                </StatusBadge>
              }
            >
              <div className={styles.sliderContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>0 (CRITICAL / SEVERE)</span>
                  <span>5 (MODERATE)</span>
                  <span>10 (OPTIMAL / PEAK)</span>
                </div>
                <Slider
                  label={currentQ.title}
                  min={0}
                  max={10}
                  step={0.5}
                  value={answers[currentQ.key as keyof typeof answers]}
                  onChange={val => setAnswers(prev => ({ ...prev, [currentQ.key]: val }))}
                />
              </div>

              {/* How to Measure & Why it Matters Cards */}
              <div className={styles.howWhyGrid}>
                <div className={styles.infoCard}>
                  <div className={styles.infoCardEyebrow}>
                    <Icon name="scan" size={12} />
                    <span>HOW TO MEASURE</span>
                  </div>
                  <p className={styles.infoCardText}>{currentQ.how}</p>
                </div>

                <div className={styles.infoCard}>
                  <div className={styles.infoCardEyebrow}>
                    <Icon name="spark" size={12} />
                    <span>WHY IT MATTERS</span>
                  </div>
                  <p className={styles.infoCardText}>{currentQ.why}</p>
                </div>
              </div>

              {/* Stepper Buttons */}
              <div className={styles.stepControls}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={activeStep === 0}
                  onClick={() => setActiveStep(s => s - 1)}
                >
                  PREVIOUS
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveStep(s => s + 1)}
                >
                  {activeStep === 4 ? 'CALCULATE READINESS' : 'NEXT STEP'}
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel eyebrow="ASTRONAUT CHECK-IN SUMMARY" title="Subjective self-ratings">
              <div style={{ display: 'grid', gap: '8px' }}>
                {QUESTIONS.map((q, idx) => (
                  <div
                    key={q.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--line-subtle)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>0{idx + 1}. {q.title}</span>
                    <strong style={{ color: 'var(--blue-bright)' }}>{answers[q.key as keyof typeof answers]} / 10</strong>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px' }}>
                <Button variant="secondary" size="sm" onClick={() => setActiveStep(0)}>
                  RE-ENTER 5-STEP ANSWERS
                </Button>
              </div>
            </Panel>
          )}

          {/* Readiness Score Panel */}
          <Panel
            eyebrow="MISSION READINESS ASSESSMENT"
            title="Tomorrow EVA readiness score"
            action={
              <StatusBadge tone={readiness >= 85 ? 'green' : readiness >= 60 ? 'amber' : 'red'} dot>
                {readiness >= 85 ? 'CLEARED FOR EVA' : readiness >= 60 ? 'CAUTION' : 'PROHIBITED / SWAP'}
              </StatusBadge>
            }
          >
            <div className={styles.readinessHero}>
              <div className={styles.readinessScore}>
                <span style={{ color: readiness >= 85 ? 'var(--green)' : readiness >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                  {readiness.toFixed(1)}
                </span>
                <small>/ 100</small>
              </div>

              <div className={styles.readinessBar}>
                <div
                  className={styles.readinessBarFill}
                  style={{
                    width: `${readiness}%`,
                    backgroundColor: readiness >= 85 ? 'var(--green)' : readiness >= 60 ? 'var(--amber)' : 'var(--red)',
                  }}
                />
              </div>

              <div className={styles.readinessTicks}>
                <span>0 PROHIBITED</span>
                <span>60 CAUTION</span>
                <span>85 CLEARED</span>
                <span>100 PEAK</span>
              </div>
            </div>

            {/* 3 Gamified Quests WITH EXPLICIT CHECKBOXES */}
            <div style={{ marginTop: '14px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                SELECT RECOVERY QUESTS TO EARN BONUS READINESS:
              </span>

              <div className={styles.questsList} style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {RECOVERY_QUESTS.map(q => {
                  const isChecked = selectedQuests.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuest(q.id)}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        border: isChecked ? '1px solid var(--green)' : '1px solid var(--line-subtle)',
                        background: isChecked ? 'rgba(46, 204, 113, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Checkbox Square */}
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            border: isChecked ? '1px solid var(--green)' : '1px solid var(--line-bright)',
                            background: isChecked ? 'var(--green)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            color: '#000',
                            fontWeight: 800,
                            fontSize: '12px',
                          }}
                        >
                          {isChecked ? '✓' : ''}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: isChecked ? 'var(--green)' : 'var(--text-strong)' }}>
                            {q.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{q.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isChecked && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: 'rgba(46,204,113,0.2)', color: 'var(--green)', padding: '2px 6px', border: '1px solid var(--green)' }}>
                            COMPLETED
                          </span>
                        )}
                        <span className={styles.questBonus} style={{ color: isChecked ? 'var(--green)' : 'var(--amber)' }}>
                          +{q.bonus} PTS
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Exact Physical Biometrics */}
          <Panel eyebrow="CLINICAL INPUTS" title="Physiological values">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', border: '1px solid var(--line-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>BLOOD SUGAR</span>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '2px' }}>
                  {bloodSugar} <small style={{ fontSize: '10px' }}>mg/dL</small>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', border: '1px solid var(--line-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>BLOOD PRESSURE</span>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '2px' }}>
                  {bpSys}/{bpDia} <small style={{ fontSize: '10px' }}>mmHg</small>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', border: '1px solid var(--line-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>BODY TEMP</span>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', marginTop: '2px' }}>
                  {bodyTemp} <small style={{ fontSize: '10px' }}>°C</small>
                </div>
              </div>
            </div>
          </Panel>

        </div>

        {/* Right Column: Consequence Simulator, 14 Sol Trend & Commander Directive */}
        <div className={styles.rightCol}>
          
          {/* Consequence Simulator: Dual Forecast Curve */}
          <Panel
            eyebrow="CONSEQUENCE SIMULATOR // PREDICTIVE MODEL"
            title="Tomorrow EVA readiness trajectory"
            action={<StatusBadge tone="blue">CHART DUAL-CURVE</StatusBadge>}
          >
            <ForecastChart
              baseline={eveningResult?.forecast_curve_no_rest ?? [78, 70, 62, 55, 48, 42, 35, 28, 22, 18, 14, 10]}
              withQuests={eveningResult?.forecast_curve_with_quests ?? [78, 80, 82, 85, 87, 89, 90, 92, 92, 93, 94, 95]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
              <span style={{ color: 'var(--amber)' }}>■ WITHOUT QUESTS (CRASH TRAJECTORY)</span>
              <span style={{ color: 'var(--blue-bright)' }}>■ WITH RECOVERY QUESTS</span>
            </div>
          </Panel>

          {/* 14 Sols OSDR History */}
          <Panel
            eyebrow="NASA OSDR // OSD-783 / OSD-435"
            title="14-sol objective sensor trend"
            action={<StatusBadge tone="neutral">SOL 1-14</StatusBadge>}
          >
            <div style={{ height: '80px', marginTop: '6px' }}>
              <Sparkline
                values={crewHistory?.history?.map(h => h.objective_sensor_score) ?? [92, 88, 75, 90, 84, 86, 70, 88, 85, 82, 78, 74, 68, 62]}
                color="var(--blue-bright)"
                label="14-sol objective sensor trend"
              />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', marginTop: '6px' }}>
              DATA SOURCE: NASA OPEN SCIENCE DATA REPOSITORY (SPACEFLIGHT GAIT & BONE LOAD STUDY)
            </div>
          </Panel>

          {/* Commander-in-the-Loop Panel WITH MARKDOWN & 3 DECISION BUTTONS */}
          <div className={styles.commanderBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--blue-bright)', fontWeight: 700 }}>
                AI FLIGHT SURGEON ADVISORY BRIEFING // NASA-STD-3001
              </span>
              <StatusBadge tone="blue">RAG-LLM TEMP=0.0</StatusBadge>
            </div>

            {/* Formatted Markdown Box */}
            <div className={styles.commanderQuote}>
              {renderMarkdownSummary(summaryResult?.text ?? 'Retrieving standardized operational summary...')}
            </div>

            {summaryResult?.citations && summaryResult.citations.length > 0 && (
              <div className={styles.commanderCitations}>
                CITATIONS: {summaryResult.citations.join(' · ')}
              </div>
            )}

            {/* Decision Status OR 3 Action Buttons */}
            {activeDecision ? (
              <div
                style={{
                  padding: '10px 14px',
                  background: activeDecision.tone === 'green' ? 'rgba(46,204,113,0.15)' : activeDecision.tone === 'red' ? 'rgba(239,68,68,0.15)' : 'rgba(245,179,1,0.15)',
                  border: `1px solid ${activeDecision.tone === 'green' ? 'var(--green)' : activeDecision.tone === 'red' ? 'var(--red)' : 'var(--amber)'}`,
                  color: activeDecision.tone === 'green' ? 'var(--green)' : activeDecision.tone === 'red' ? 'var(--red)' : 'var(--amber)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{activeDecision.title}</div>
                  <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>{activeDecision.desc}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleResetDecision}>
                  CHANGE
                </Button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <Button variant="danger" size="sm" onClick={handleReassign}>
                  ⛔ APPROVE SWAP // REASSIGN TO REST (ОТСТРАНИТЬ)
                </Button>
                <Button variant="primary" size="sm" onClick={handleClearForEva}>
                  🚀 COMMANDER OVERRIDE // CLEAR (ДОПУСТИТЬ)
                </Button>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
