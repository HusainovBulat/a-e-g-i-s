import { normalizeEnvId } from './api/client';
import type { ConsoleFrame, CrewId, EnvId } from './api/types';
import { hasFall } from './crew';
import { formatMinutes, type Tone } from './status';

/** EVA pairs: A–B outside, C–D at base. */
export const buddyOf: Record<CrewId, CrewId> = { A: 'B', B: 'A', C: 'D', D: 'C' };

export interface VisorModel {
  crew: CrewId;
  buddy: CrewId;
  /** Where the astronaut is: picks the scene seen through the visor. */
  env: EnvId;
  waiting: boolean;
  walkBack: string;
  walkBackTone: Tone;
  walkBackPct: number;
  o2: number | null;
  o2Tone: Tone;
  hr: number | null;
  hrTone: Tone;
  slope: number | null;
  legs: number | null;
  legsTone: Tone;
  buddyDown: boolean;
  selfDown: boolean;
  /** Short order shown at the lower edge of the visor. */
  command: { text: string; tone: Tone };
  /** Whole-visor edge glow. */
  alert: Tone | null;
}

/** Everything the helmet HUD shows for one astronaut, derived from the live console frame. */
export function visorModel(frame: ConsoleFrame | null, crew: CrewId): VisorModel {
  const buddy = buddyOf[crew];
  const state = frame?.crews[crew];
  const buddyState = frame?.crews[buddy];
  const base: VisorModel = {
    crew, buddy, env: normalizeEnvId(state?.vitals?.env ?? 'crater_eva'), waiting: true, walkBack: '--:--', walkBackTone: 'neutral', walkBackPct: 0,
    o2: null, o2Tone: 'neutral', hr: null, hrTone: 'neutral', slope: null, legs: null, legsTone: 'neutral',
    buddyDown: false, selfDown: false, command: { text: 'LINKING TO SUIT…', tone: 'neutral' }, alert: null,
  };
  if (!frame || !state) return base;

  const v = state.vitals;
  const walk = state.model_b.walk_back_min;
  const legsFail = state.model_a.legs_fail_min;
  const fatigue = Math.round(state.model_a.fatigue_score);
  const selfDown = hasFall(state);
  const buddyDown = hasFall(buddyState) || Boolean(buddyState?.alarm?.reasons?.some(r => /fall|sos/i.test(r)));
  const walkBackTone: Tone = selfDown || walk < 15 ? 'red' : walk < 30 ? 'amber' : 'green';
  const legsTone: Tone = fatigue >= 70 || (legsFail !== null && legsFail <= 15) ? 'red' : fatigue >= 50 ? 'amber' : 'neutral';

  let command: VisorModel['command'] = { text: 'ON SCHEDULE', tone: 'neutral' };
  if (buddyDown) command = { text: `GO TO BUDDY ${buddy}`, tone: 'red' };
  else if (selfDown) command = { text: 'FALL DETECTED · PRESS OK ON WRIST', tone: 'red' };
  else if (walk < 15) command = { text: 'TURN BACK NOW', tone: 'red' };
  else if (v.dizzy) command = { text: 'STOP · SIT DOWN', tone: 'amber' };
  else if (legsTone === 'red') command = { text: 'REST 60 S · LEGS TIRING', tone: 'amber' };

  return {
    crew, buddy, env: normalizeEnvId(v.env), waiting: false,
    walkBack: selfDown ? '00:00' : formatMinutes(walk),
    walkBackTone,
    walkBackPct: selfDown ? 0 : Math.min(100, (walk / 60) * 100),
    o2: Math.round(state.model_b.o2_left_pct),
    o2Tone: state.model_b.o2_left_pct < 25 ? 'red' : state.model_b.o2_left_pct < 50 ? 'amber' : 'neutral',
    hr: Math.round(v.hr),
    hrTone: v.hr > 150 || v.hr < 45 ? 'red' : v.hr > 120 ? 'amber' : 'neutral',
    slope: Math.round(v.slope),
    legs: fatigue,
    legsTone,
    buddyDown, selfDown, command,
    alert: command.tone === 'red' ? 'red' : command.tone === 'amber' ? 'amber' : null,
  };
}
