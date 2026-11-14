import { describe, expect, it } from 'vitest';
import { classifyBand, deriveCrewState, runEvening, runTriage } from '../engine';
import type { EveningRequest, SensorPacket, TriageRequest } from '../../../lib/api/types';

const vitals: SensorPacket = {
  crew: 'A', t: 0, env: 'crater_eva', hr: 74, sys: 118, dia: 76, spo2: 98, resp: 15, st: 0.005,
  temp: 36.7, blood_sugar_mgdl: 92, smo2: 78, emg_mdf: -2, gait: 0.22, slope: 3, speed: 2.5,
  o2_left: 680, fall: false, nirs_ok: true, dizzy: false,
};

const eveningRequest = (overrides: Partial<EveningRequest> = {}): EveningRequest => ({
  crew: 'A',
  answers: { sleep: 8, energy: 8, mood: 8, pain_free: 8, nutrition: 8 },
  blood_sugar_mgdl: 96, bp_sys: 118, bp_dia: 76, body_temp_c: 36.7, fatigue_score: 40,
  ...overrides,
});

describe('mock health engine', () => {
  it('uses the 80/60 traffic-light boundaries', () => {
    expect(classifyBand(80)).toBe('green');
    expect(classifyBand(79)).toBe('amber');
    expect(classifyBand(60)).toBe('amber');
    expect(classifyBand(59)).toBe('red');
  });

  it('flags the nitroglycerin contraindication when systolic pressure is below 90', () => {
    const request: TriageRequest = { crew: 'A', symptoms: ['chest_pain'], vitals: { ...vitals, sys: 82 } };
    const result = runTriage(request);
    expect(result.primary_class).toBe('Acute Coronary Ischemia');
    expect(result.dont_give_list.join(' ')).toMatch(/nitroglycerin/i);
    expect(result.flight_surgeons_queued).toBe(true);
  });

  it('puts oxygen first when SpO2 is below 92 percent', () => {
    const result = runTriage({ crew: 'A', symptoms: ['shortness_of_breath'], vitals: { ...vitals, spo2: 90 } });
    expect(result.primary_class).toBe('Hypoxemia / Respiratory Distress');
    expect(result.protocol_steps[0].title).toMatch(/oxygen/i);
  });

  it('detects masking when high reported energy conflicts with severe fatigue', () => {
    const result = runEvening(eveningRequest({ fatigue_score: 70 }));
    expect(result.mismatch_detected).toBe(true);
    expect(result.mismatch_text).toMatch(/mismatch/i);
  });

  it('applies quest bonuses and caps readiness at 100', () => {
    const result = runEvening(eveningRequest({
      answers: { sleep: 10, energy: 10, mood: 10, pain_free: 10, nutrition: 10 },
      quest_ids: ['compression', 'hydration', 'sleep-window'],
    }));
    expect(result.applied_quests).toEqual(['compression', 'hydration', 'sleep-window']);
    expect(result.readiness_score).toBe(100);
  });

  it('activates the NIRS fallback when the sensor is unavailable', () => {
    expect(deriveCrewState({ ...vitals, nirs_ok: false }).model_a.fallback).toBe(true);
  });
});
