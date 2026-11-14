// @vitest-environment jsdom
/**
 * Contract tests for the REST side of lib/api/client.ts:
 *  - requests must match the FastAPI schemas (app/schemas.py),
 *  - responses captured from the real Base Server must map to the console types correctly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aegisApi, getApiBase, normalizeEnvId, toBackendEnv } from '../../lib/api/client';
import type { EnvId } from '../../lib/api/types';
import { backend, clone, mockFetch } from '../helpers';

const ZONES = {
  cns: 'cns_brain',
  cardio: 'cardiovascular',
  resp: 'respiratory',
  thermo: 'immune_thermo',
  metabolic: 'metabolic_nutrition',
  musculo: 'musculoskeletal',
} as const;

describe('getApiBase', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('targets port 8000 on the host that served the console (works for phones on the hotspot)', () => {
    expect(getApiBase()).toBe(`${window.location.protocol}//${window.location.hostname}:8000`);
  });

  it('uses the same origin behind the HTTPS proxy (default port 443)', () => {
    expect(getApiBase({ protocol: 'https:', hostname: '192.168.2.2', port: '' })).toBe('https://192.168.2.2');
  });

  it('keeps :8000 for the plain-HTTP stack (console on :3000)', () => {
    expect(getApiBase({ protocol: 'http:', hostname: '192.168.2.2', port: '3000' })).toBe('http://192.168.2.2:8000');
  });

  it('honours NEXT_PUBLIC_API_BASE and strips the trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', 'https://aegis.example.org/');
    expect(getApiBase()).toBe('https://aegis.example.org');
  });
});

describe('environment ids', () => {
  const pairs: [EnvId, string][] = [
    ['crater_eva', 'surface_eva_spacesuit'],
    ['moon_base', 'lunar_base_habitat'],
    ['rover', 'pressurized_rover'],
    ['mars_transit', 'spacecraft_mars_transit'],
    ['orbit_station', 'space_station_orbital'],
  ];

  it.each(pairs)('%s <-> %s round-trips', (ui, api) => {
    expect(toBackendEnv(ui)).toBe(api);
    expect(normalizeEnvId(api)).toBe(ui);
  });

  it('maps every environment from thresholds.json known to the backend', () => {
    for (const env of backend.hello.data.environments) {
      expect(toBackendEnv(normalizeEnvId(env))).toBe(env);
    }
  });
});

describe('REST transport', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('POST /api/triage sends backend symptom_flags and Crew_X ids', async () => {
    const { calls } = mockFetch({ '/api/triage': backend.triage });
    await aegisApi.triage({
      crew: 'B',
      symptoms: ['chest_pain', 'dizziness', 'shortness_of_breath', 'fall'],
      vitals: { sys: 82, dia: 50 } as any,
      text: 'he is clutching his chest',
      ultrasound_attached: true,
    });
    expect(calls[0].url).toMatch(/\/api\/triage$/);
    expect(calls[0].body).toMatchObject({
      crew: 'Crew_B',
      vitals: { sys: 82, dia: 50 },
      symptom_flags: { chest_pain: true, dizzy: true, short_breath: true, fall_event: true, cold_sweat: false },
      transcript: 'he is clutching his chest',
      ultrasound_attached: true,
    });
  });

  it('maps the real chest-pain triage response (nitroglycerin block, steps, flight surgeons)', async () => {
    mockFetch({ '/api/triage': backend.triage });
    const res = await aegisApi.triage({ crew: 'A', symptoms: ['chest_pain'] });

    expect(res.primary_class).toBe('Acute Coronary Ischemia');
    expect(res.flight_surgeons_queued).toBe(true);
    expect(res.tree_path_why).toContain('Acute Coronary Ischemia');
    expect(res.dont_give_list).toHaveLength(1);
    expect(res.dont_give_list[0]).toMatch(/DON'T GIVE NITROGLYCERIN \(BP 82\/50 < 90 mmHg\)/);

    expect(res.protocol_steps.map(s => s.order)).toEqual(backend.triage.protocol_steps.map(s => s.step));
    expect(res.protocol_steps.every(s => s.title && s.instruction)).toBe(true);
    expect(res.protocol_steps[0].diagram).toBe('position');

    expect(res.ranked_other_classes).toHaveLength(backend.triage.ranked_other_classes.length);
    expect(res.ranked_other_classes.map(r => r.class_name)).not.toContain(res.primary_class);
  });

  it('POST /api/evening flattens answers into the backend schema', async () => {
    const { calls } = mockFetch({ '/api/evening': backend.evening });
    await aegisApi.evening({
      crew: 'A',
      answers: { sleep: 9, energy: 9, mood: 8, pain_free: 7, nutrition: 6 },
      blood_sugar_mgdl: 108, bp_sys: 118, bp_dia: 76, body_temp_c: 36.8,
      quest_ids: ['hydration'],
    } as any);
    expect(calls[0].body).toEqual({
      crew: 'Crew_A', sleep: 9, energy: 9, mood: 8, pain_free: 7, nutrition: 6,
      blood_sugar_mgdl: 108, bp_sys: 118, bp_dia: 76, temp: 36.8, completed_quests: ['hydration'],
    });
  });

  it('maps readiness, band, mismatch and forecast curves from the real evening response', async () => {
    mockFetch({ '/api/evening': backend.evening });
    const res = await aegisApi.evening({ crew: 'A', answers: { sleep: 9, energy: 9, mood: 9, pain_free: 9, nutrition: 9 } } as any);
    expect(res.crew).toBe('A');
    expect(res.readiness_score).toBe(backend.evening.readiness_score);
    expect(res.band).toBe(backend.evening.band);
    expect(res.mismatch_detected).toBe(true);
    expect(res.mismatch_text).toMatch(/Mismatch Detected/);
    expect(res.forecast_curve_no_rest).toEqual(backend.evening.forecast_curve_no_rest);
    expect(res.forecast_curve_with_quests).toEqual(backend.evening.forecast_curve_with_quests);
    expect(res.applied_quests).toEqual(['hydration']);
  });

  // Regression: organ_scores_6 is keyed by cns_brain/cardiovascular/... — all zones used to show 85.
  it('maps the 6 organ scores of the evening check-in (not the 85 placeholder)', async () => {
    mockFetch({ '/api/evening': backend.evening });
    const res = await aegisApi.evening({ crew: 'A', answers: { sleep: 9, energy: 9, mood: 9, pain_free: 9, nutrition: 9 } } as any);
    for (const [ui, api] of Object.entries(ZONES)) {
      expect(res.organ_scores_6[ui as keyof typeof ZONES]).toBe((backend.evening.organ_scores_6 as any)[api].score);
    }
  });

  // Regression: the normalized EveningResponse (no objective_score / vitals / delta) used to be
  // posted as "evening", so the Commander briefing ran on default numbers. Now only the crew id
  // is sent and the backend uses its full stored result of POST /evening.
  it('POST /api/summary lets the backend use its full evening result', async () => {
    const { calls } = mockFetch({ '/api/evening': backend.evening, '/api/summary': backend.summary });
    const evening = await aegisApi.evening({ crew: 'D', answers: { sleep: 9, energy: 9, mood: 9, pain_free: 9, nutrition: 9 } } as any);
    await aegisApi.summary(evening);
    const body = calls.find(c => c.url.endsWith('/api/summary'))!.body;
    expect(body).toEqual({ crew: 'Crew_D' });
  });

  // Regression: "Retrieve AED from Bay B2" used to match 'bay' before 'aed'.
  it('shows the AED pad diagram on the defibrillator step', async () => {
    mockFetch({ '/api/triage': backend.triage });
    const res = await aegisApi.triage({ crew: 'A', symptoms: ['chest_pain'] });
    const aedStep = res.protocol_steps.find(s => /AED|Defibrillator/.test(s.title))!;
    expect(aedStep.diagram).toBe('aed');
  });

  it('maps the Commander summary', async () => {
    mockFetch({ '/api/summary': backend.summary });
    const res = await aegisApi.summary({ crew: 'A' } as any);
    expect(res.text).toContain('NASA-STD-3001');
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.source).toBe(backend.summary.source);
  });

  it('sendSensors: a scenario key starts server playback for Crew_X', async () => {
    const { calls } = mockFetch({ '/api/sensors': { ok: true } });
    await aegisApi.sendSensors({ crew: 'C', scenario: 'chest_pain' });
    expect(calls[0].body).toMatchObject({ type: 'scenario', scenario: 'chest_pain', fall: 0, nirs_ok: 1, dizzy: 0 });
    expect(['C', 'Crew_C']).toContain(calls[0].body.crew);
  });

  it('sendSensors: slider packets become telemetry with 0/1 flags and backend env ids', async () => {
    const { calls } = mockFetch({ '/api/sensors': { ok: true } });
    await aegisApi.sendSensors({ crew: 'A', hr: 130, fall: true, nirs_ok: false, dizzy: true, env: 'rover' });
    expect(calls[0].body).toMatchObject({ type: 'telemetry', hr: 130, fall: 1, nirs_ok: 0, dizzy: 1, env: 'pressurized_rover' });
  });

  it('sendSensors: "reset_all" calls POST /api/reset', async () => {
    const { calls } = mockFetch({ '/api/reset': { ok: true } });
    await aegisApi.sendSensors({ crew: 'A', scenario: 'reset_all' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST' });
    expect(calls[0].url).toMatch(/\/api\/reset$/);
  });

  it('postEvent sends the event in the /events schema', async () => {
    const { calls } = mockFetch({ '/api/events': { ok: true } });
    await aegisApi.postEvent({ type: 'visor_instruction', crew: 'A', text: 'Stop 60 s' } as any);
    expect(calls[0].body).toMatchObject({ type: 'visor_instruction', crew: 'Crew_A', text: 'Stop 60 s' });
  });

  it('surfaces the FastAPI error detail', async () => {
    mockFetch({ '/api/evening': { detail: 'sleep must be <= 10' } }, 422);
    await expect(aegisApi.evening({ crew: 'A', answers: { sleep: 11 } } as any)).rejects.toThrow('sleep must be <= 10');
  });

  it('crew history keeps the 14 OSDR sols', async () => {
    mockFetch({ '/api/crew/A/history': backend.history });
    const h = await aegisApi.getCrewHistory('A');
    expect(h).toMatchObject({ id: 'A', name: 'Astronaut A', role: 'EVA Specialist' });
    expect(h.history).toHaveLength(14);
  });

  it('getScenarios / getRouteProfile accept both dict and list payloads', async () => {
    mockFetch({
      '/api/scenarios': { scenarios: { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' } } },
      '/api/route-profile': { points: [{ point_idx: 0, distance_m: 0, elevation_m: 1, slope_deg: 2 }] },
    });
    expect((await aegisApi.getScenarios()).map(s => s.id)).toEqual(['a', 'b']);
    expect(await aegisApi.getRouteProfile()).toHaveLength(1);
  });

  it('pairing uses the backend URL, and falls back to this host when the API is down', async () => {
    mockFetch({ '/api/pairing': backend.pairing });
    expect((await aegisApi.getPairing('A')).url).toBe(backend.pairing.url);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const fallback = await aegisApi.getPairing('D');
    expect(fallback.url).toMatch(/\/phone\?crew=D$/);
  });

  it('does not mutate the fixtures it reads', async () => {
    const before = clone(backend.triage);
    mockFetch({ '/api/triage': backend.triage });
    await aegisApi.triage({ crew: 'A', symptoms: [] });
    expect(backend.triage).toEqual(before);
  });
});
