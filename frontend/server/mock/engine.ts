import thresholdSeed from './seed/thresholds.json';
import excerptSeed from './seed/nasa_std_3001_excerpts.json';
import { baseProtocolSteps, quests, triageClasses } from './content';
import type { Band, CrewState, EveningRequest, EveningResponse, SensorPacket, TriageRequest, TriageResponse, ZoneId } from '../../lib/api/types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const round = (value: number, digits = 0) => Number(value.toFixed(digits));

export function classifyBand(score: number): Band {
  const scales = thresholdSeed.scales;
  if (score >= scales.green_nominal[0]) return 'green';
  if (score >= scales.yellow_caution[0]) return 'amber';
  return 'red';
}

const score = (value: number) => Math.round(clamp(value, 0, 100));

export function deriveCrewState(vitals: SensorPacket): CrewState {
  const fatigue = score(
    (100 - vitals.smo2) * 1.25 + Math.abs(vitals.emg_mdf) * 0.45 + Math.max(0, vitals.slope - 10) * 1.25 + Math.max(0, vitals.gait - 0.2) * 120,
  );
  const modelA = {
    fatigue_score: fatigue,
    legs_fail_min: round(clamp(58 - fatigue * 0.42 - Math.max(0, vitals.slope - 4) * 0.52, 0, 120), 1),
    fallback: !vitals.nirs_ok,
  };
  const metabolicW = Math.round(clamp(95 + vitals.hr * 1.45 + vitals.slope * 5.5 + vitals.speed * 13, 80, 900));
  const o2Burn = round(clamp(0.55 + metabolicW / 365, 0.6, 3.5), 2);
  const walkBack = clamp((vitals.o2_left - 150) / (o2Burn * (4 + Math.max(0, vitals.slope) / 10)), 0, 120);
  const organScores: Record<ZoneId, number> = {
    cns: score(100 - Math.max(0, vitals.hr - 90) * 0.45 - Number(vitals.dizzy) * 18 - Math.max(0, vitals.resp - 24) * 1.2),
    cardio: score(100 - Math.abs(vitals.sys - 115) * 0.28 - Math.max(0, vitals.hr - 100) * 0.38 - Math.abs(vitals.st) * 55),
    resp: score(vitals.spo2 * 1.02 - Math.max(0, vitals.resp - 20) * 1.3),
    thermo: score(100 - Math.abs(vitals.temp - 36.8) * 16),
    metabolic: score(100 - Math.abs(vitals.blood_sugar_mgdl - 95) * 0.32 - fatigue * 0.12),
    musculo: score(vitals.smo2 * 0.7 + (100 - fatigue) * 0.3 - Math.max(0, vitals.gait - 0.2) * 45),
  };
  const average = Object.values(organScores).reduce((sum, value) => sum + value, 0) / Object.keys(organScores).length;
  return {
    crew: vitals.crew,
    vitals,
    band: classifyBand(average),
    organ_scores_6: organScores,
    model_a: modelA,
    model_b: {
      metabolic_w: metabolicW,
      o2_burn_l_min: o2Burn,
      o2_left_pct: round(clamp(vitals.o2_left / thresholdSeed.eva_spacesuit_plss.tank_capacity_liters * 100, 0, 100), 1),
      walk_back_min: round(walkBack, 1),
    },
  };
}

export function runTriage(request: TriageRequest): TriageResponse {
  const systolic = request.vitals?.sys ?? 118;
  const spo2 = request.vitals?.spo2 ?? 98;
  const st = request.vitals?.st ?? 0;
  const has = (symptom: string) => request.symptoms.includes(symptom as TriageRequest['symptoms'][number]);
  const suspectedCardiac = has('chest_pain') || Math.abs(st) >= 0.1;
  const fallDetected = has('fall') || request.vitals?.fall === true;
  const respiratoryConcern = has('shortness_of_breath') || spo2 < 92;

  let primaryClass: string;
  if (fallDetected) primaryClass = 'Fall / Musculoskeletal Injury';
  else if (suspectedCardiac) primaryClass = 'Acute Coronary Ischemia';
  else if (respiratoryConcern) primaryClass = 'Hypoxemia / Respiratory Distress';
  else if (has('dizziness')) primaryClass = 'Decompression Barotrauma';
  else primaryClass = 'Nominal / Monitor';

  const rankedOtherClasses = triageClasses
    .filter(name => name !== primaryClass)
    .slice(0, 3)
    .map((className, index) => ({ class_name: className, confidence: round(Math.max(0.05, 0.32 - index * 0.1), 2) }));
  const nitroBlocked = suspectedCardiac && systolic < 90;
  const dontGiveList = nitroBlocked ? [thresholdSeed.critical_clinical_rules.nitroglycerin_block.alert_text.replace(/^[^A-Za-z]+/, '')] : [];
  const oxygenFirst = spo2 < 92;
  const protocolSteps = oxygenFirst
    ? [
        { order: 1, title: 'Start supplemental oxygen', instruction: 'Begin high-flow oxygen using the approved suit interface and recheck SpO₂.', diagram: 'oxygen' as const },
        ...baseProtocolSteps.filter(step => step.diagram !== 'oxygen').map((step, index) => ({ ...step, order: index + 2 })),
      ]
    : baseProtocolSteps;

  return {
    primary_class: primaryClass,
    ranked_other_classes: rankedOtherClasses,
    tree_path_why: `Symptoms → ${suspectedCardiac ? 'chest pain / ECG assessment' : fallDetected ? 'fall event' : respiratoryConcern ? 'oxygenation threshold' : 'vital-sign review'} → ${primaryClass}`,
    dont_give_list: dontGiveList,
    protocol_steps: protocolSteps,
    flight_surgeons_queued: primaryClass !== 'Nominal / Monitor',
    ultrasound_attached: request.ultrasound_attached ?? false,
  };
}

export function runEvening(request: EveningRequest): EveningResponse {
  const answers = request.answers;
  const weightedInput = answers.sleep * 0.3 + answers.energy * 0.2 + answers.mood * 0.15 + answers.pain_free * 0.2 + answers.nutrition * 0.15;
  const glucosePenalty = request.blood_sugar_mgdl < 70 || request.blood_sugar_mgdl > 120 ? 5 : 0;
  const pressurePenalty = request.bp_sys < 90 || request.bp_sys > 150 || request.bp_dia > 100 ? 8 : 0;
  const temperaturePenalty = request.body_temp_c < 36 || request.body_temp_c > 37.5 ? 6 : 0;
  const fatigue = clamp(request.fatigue_score ?? 0, 0, 100);
  const mismatch = answers.energy >= 8 && fatigue >= 70;
  const mismatchText = mismatch ? 'Mismatch detected: reported energy is high while objective muscle fatigue is elevated. Hold EVA auto-clearance for commander review.' : null;
  const baseReadiness = clamp(weightedInput * 10 - glucosePenalty - pressurePenalty - temperaturePenalty - Math.max(0, fatigue - 55) * 0.12, 0, 100);
  const appliedQuests = quests.filter(quest => request.quest_ids?.includes(quest.id)).map(quest => quest.id);
  const questBonus = quests.filter(quest => appliedQuests.includes(quest.id)).reduce((sum, quest) => sum + quest.bonus, 0);
  const readiness = score(baseReadiness + questBonus);
  const organScores: Record<ZoneId, number> = {
    cns: score(answers.sleep * 8 + (10 - Math.max(0, fatigue - 60) / 10) * 2),
    cardio: score(100 - pressurePenalty * 3),
    resp: 96,
    thermo: score(100 - temperaturePenalty * 4),
    metabolic: score(100 - glucosePenalty * 4),
    musculo: score(100 - fatigue * 0.65),
  };
  const forecastNoRest = Array.from({ length: 7 }, (_, index) => score(baseReadiness - index * (mismatch ? 2.4 : 1.1)));
  const forecastWithQuests = Array.from({ length: 7 }, (_, index) => score(baseReadiness + questBonus * (1 - index * 0.1) - index * 0.65));
  return {
    readiness_score: readiness,
    band: classifyBand(readiness),
    mismatch_detected: mismatch,
    mismatch_text: mismatchText,
    forecast_curve_no_rest: forecastNoRest,
    forecast_curve_with_quests: forecastWithQuests,
    organ_scores_6: organScores,
    applied_quests: appliedQuests,
  };
}

export function runSummary(response: EveningResponse) {
  const excerpts = excerptSeed as Record<string, { title: string; rule: string }>;
  const citations = Object.values(excerpts).map(item => item.title);
  const readinessLine = `EVA readiness is ${response.readiness_score}/100 (${response.band}).`;
  const actionLine = response.mismatch_detected ? response.mismatch_text ?? 'Mismatch requires commander review.' : 'No subjective/objective mismatch detected in this check-in.';
  const text = `${readinessLine} ${actionLine} Recommended commander action: review the crew recovery window before approving the next EVA schedule.`;
  return { text, citations, source: 'template' as const };
}
