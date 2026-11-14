'use client';

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import { useConsole } from '../../../lib/ConsoleProvider';
import type { CrewHistory, CrewId, EveningAnswers, EveningRequest, EveningResponse, SummaryResponse } from '../../../lib/api/types';
import { crewMeta } from '../../../lib/crew';
import { type Tone } from '../../../lib/status';
import { ForecastChart, Sparkline } from '../charts/Charts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Slider } from '../ui/Controls';
import { Icon } from '../ui/icons';
import { ProgressBar, StatusPill } from '../ui/StatusPill';
import styles from './mode3.module.css';

const QUESTIONS: Array<{ key: keyof EveningAnswers; title: string; why: string }> = [
  { key: 'sleep', title: 'How well did you sleep?', why: 'Sleep loss in low gravity slows reaction time and coordination.' },
  { key: 'energy', title: 'How much energy do you have?', why: 'Compared with sensor data to catch hidden fatigue.' },
  { key: 'mood', title: 'How is your mood?', why: 'Isolation and confinement stress affect the whole crew.' },
  { key: 'pain_free', title: 'How free of pain are you?', why: 'Muscle and back pain are early signs of overload.' },
  { key: 'nutrition', title: 'Did you eat and drink enough?', why: 'Dehydration leads to fainting when standing up.' },
];

const QUESTS = [
  { id: 'hydration', title: 'Electrolyte drink', desc: '500 mL isotonic fluid', bonus: 15 },
  { id: 'compression', title: 'Calf compression', desc: '40 min pneumatic boots', bonus: 18 },
  { id: 'breathing', title: 'Guided breathing', desc: '10 min wind-down', bonus: 20 },
] as const;

type Decision = { action: 'reassign' | 'clear'; text: string } | null;

const readinessTone = (score: number): Tone => (score >= 85 ? 'green' : score >= 60 ? 'amber' : 'red');
const readinessVerdict = (score: number) => (score >= 85 ? 'Cleared for EVA' : score >= 60 ? 'EVA with caution' : 'Not cleared for EVA');

export function Mode3Screen() {
  const { currentCrew, crew, api } = useConsole();
  const [answers, setAnswers] = useState<EveningAnswers>({ sleep: 8, energy: 8, mood: 8, pain_free: 7, nutrition: 8 });
  const [bloodSugar, setBloodSugar] = useState(104);
  const [bodyTemp, setBodyTemp] = useState(36.8);
  const bpSys = 118;
  const bpDia = 76;
  const [quests, setQuests] = useState<string[]>([]);
  const [result, setResult] = useState<EveningResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [history, setHistory] = useState<CrewHistory | null>(null);
  const [decisions, setDecisions] = useState<Record<CrewId, Decision>>({ A: null, B: null, C: null, D: null });
  const [, startTransition] = useTransition();

  // Pre-fill with the crew member's last logged sol (OSDR-based 14-sol history).
  useEffect(() => {
    let cancelled = false;
    void api.getCrewHistory(crew).then(data => {
      if (cancelled) return;
      setHistory(data);
      const last = data.history[data.history.length - 1];
      if (!last) return;
      setAnswers({
        sleep: last.subjective_sleep_slider ?? 8,
        energy: last.subjective_energy_slider ?? 8,
        mood: last.subjective_mood_slider ?? 8,
        pain_free: last.subjective_pain_free_slider ?? 7,
        nutrition: last.subjective_nutrition_slider ?? 8,
      });
      if (last.blood_sugar_mgdl) setBloodSugar(Math.round(last.blood_sugar_mgdl));
      if (last.body_temp_c) setBodyTemp(Number(last.body_temp_c.toFixed(1)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [api, crew]);

  const fatigue = Math.round(currentCrew?.model_a?.fatigue_score ?? 40);

  const update = useCallback(async () => {
    const req: EveningRequest = { crew, answers, blood_sugar_mgdl: bloodSugar, bp_sys: bpSys, bp_dia: bpDia, body_temp_c: bodyTemp, fatigue_score: fatigue, quest_ids: quests };
    try { setResult(await api.evening(req)); } catch { /* keep last */ }
  }, [api, crew, answers, bloodSugar, bodyTemp, fatigue, quests]);

  useEffect(() => { startTransition(() => { void update(); }); }, [update]);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => { void api.summary(result).then(setSummary).catch(() => {}); }, 400);
    return () => clearTimeout(timer);
  }, [api, result]);

  const decide = async (action: 'reassign' | 'clear') => {
    const text = action === 'reassign'
      ? `Commander: Crew ${crew} reassigned to rest, backup crew takes the next EVA.`
      : `Commander: Crew ${crew} cleared for the next EVA (commander override).`;
    await api.postEvent({ type: 'commander_decision', crew, text }).catch(() => {});
    setDecisions(prev => ({ ...prev, [crew]: { action, text } }));
  };

  const readiness = result?.readiness_score ?? 0;
  const tone = readinessTone(readiness);
  const decision = decisions[crew];
  const trend = history?.history.map(h => h.objective_sensor_score) ?? [];

  return (
    <div className={styles.layout}>
      <div className={styles.col}>
        <Card title="Evening check-in" subtitle={`${crewMeta[crew].name} rates the day from 0 (worst) to 10 (best).`}>
          <div className={styles.questions}>
            {QUESTIONS.map(q => (
              <Slider key={q.key} label={q.title} hint={q.why} value={answers[q.key]} min={0} max={10} step={0.5} unit=" / 10" onChange={v => setAnswers(prev => ({ ...prev, [q.key]: v }))} />
            ))}
          </div>
          <div className={styles.biometrics}>
            <Slider label="Blood sugar" value={bloodSugar} min={60} max={180} unit=" mg/dL" onChange={setBloodSugar} />
            <Slider label="Body temperature" value={bodyTemp} min={35} max={39.5} step={0.1} unit=" °C" onChange={v => setBodyTemp(Number(v.toFixed(1)))} />
          </div>
        </Card>

        <Card title="Recovery quests" subtitle="Each completed quest raises tomorrow’s readiness.">
          <div className={styles.quests}>
            {QUESTS.map(q => {
              const on = quests.includes(q.id);
              return (
                <button key={q.id} type="button" className={`${styles.quest} ${on ? styles.questOn : ''}`} aria-pressed={on} onClick={() => setQuests(prev => (on ? prev.filter(id => id !== q.id) : [...prev, q.id]))}>
                  <span className={styles.checkbox}>{on && <Icon name="check" size={15} strokeWidth={2.8} />}</span>
                  <span className={styles.questText}><strong>{q.title}</strong><small>{q.desc}</small></span>
                  <span className={`${styles.bonus} num`}>+{q.bonus}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className={styles.col}>
        <Card title="Readiness for tomorrow’s EVA" tone={tone === 'green' ? undefined : tone}>
          <div className={styles.verdict}>
            <div className={styles.score}>
              <strong className={`num tone-${tone}`}>{result ? Math.round(readiness) : '–'}</strong>
              <span>/ 100</span>
            </div>
            <div className={styles.verdictText}>
              <StatusPill tone={tone}>{readinessVerdict(readiness)}</StatusPill>
              <ProgressBar value={readiness} tone={tone} label="Readiness" />
              <p className={styles.muted}>Needs 85+ to be cleared, 60–84 means EVA with caution.</p>
            </div>
          </div>
          {result?.mismatch_detected && (
            <div className={styles.mismatch} role="alert">
              <Icon name="warning" size={22} />
              <div>
                <strong>Hidden fatigue detected</strong>
                <p>{result.mismatch_text ?? 'The self-rating is much higher than what the sensors show.'}</p>
              </div>
            </div>
          )}
        </Card>

        <Card title="Forecast" subtitle="Readiness over the next 12 hours">
          {result ? <ForecastChart baseline={result.forecast_curve_no_rest} withQuests={result.forecast_curve_with_quests} /> : <p className={styles.muted}>Calculating…</p>}
          <div className={styles.chartLegend}>
            <span><i className={styles.lineAmber} />Without recovery</span>
            <span><i className={styles.lineBlue} />With selected quests</span>
          </div>
        </Card>

        <Card title="Commander briefing" subtitle={briefingSource(summary?.source)}>
          <div className={styles.briefing}>{summary ? renderBriefing(summary.text) : <p className={styles.muted}>Preparing briefing…</p>}</div>
          {summary?.citations?.length ? <p className={styles.citations}>Sources: {summary.citations.join(' · ')}</p> : null}
          {decision ? (
            <div className={`${styles.decision} ${decision.action === 'clear' ? styles.decisionClear : styles.decisionRest}`}>
              <p>{decision.text}</p>
              <Button variant="ghost" size="sm" onClick={() => setDecisions(prev => ({ ...prev, [crew]: null }))}>Change</Button>
            </div>
          ) : (
            <div className={styles.decide}>
              <Button variant="danger" onClick={() => decide('reassign')}>Reassign to rest</Button>
              <Button variant="secondary" onClick={() => decide('clear')}>Clear for EVA</Button>
            </div>
          )}
          <p className={styles.muted}>The AI only advises — the decision stays with the commander.</p>
        </Card>

        {trend.length > 1 && (
          <Card title="14-sol sensor trend" subtitle="Objective health score per sol · NASA OSDR OSD-783 / OSD-435 based">
            <div className={styles.trend}><Sparkline values={trend} color="var(--blue)" label="14-sol objective sensor score" /></div>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Minimal markdown for the commander summary: headings, bullets, **bold**, LaTeX leftovers. */
function renderBriefing(text: string): ReactNode {
  const clean = text
    .replace(/\$\\ge\s*([0-9.]+)\$/g, '≥ $1')
    .replace(/\$\\text\{SmO\}_2\s*=\s*([0-9.]+)\\%\$/g, 'SmO₂ = $1%')
    .replace(/\$\\Delta\s*=\s*([^$]+)\$/g, 'Δ = $1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/⚠️?|📖|🎯/g, '');
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part);
  return clean.split('\n').map((raw, i) => {
    const line = raw.trim();
    if (!line) return null;
    if (line.startsWith('#')) return <h4 key={i}>{line.replace(/^#+\s*/, '')}</h4>;
    if (/^(\d+\.|\*|-|•)\s+/.test(line)) return <p key={i} className={styles.bullet}>{inline(line.replace(/^(\d+\.|\*|-|•)\s+/, ''))}</p>;
    if (/DISQUALIF|PROHIBITED|NOT CLEARED/i.test(line)) return <p key={i} className={styles.flag}>{inline(line)}</p>;
    return <p key={i}>{inline(line)}</p>;
  });
}

function briefingSource(source: string | undefined): string {
  if (!source) return 'Based on NASA-STD-3001';
  if (/template|fallback/i.test(source)) return 'Rule-based template · NASA-STD-3001';
  if (/llm|rag|groq/i.test(source)) return 'AI summary (RAG-LLM) · NASA-STD-3001';
  return source;
}
