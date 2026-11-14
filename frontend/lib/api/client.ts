'use client';

import type {
  AegisTransport,
  Band,
  ConsoleEvent,
  ConsoleEventInput,
  ConsoleEventType,
  ConsoleFrame,
  CrewHistory,
  CrewId,
  CrewState,
  EnvId,
  EveningRequest,
  EveningResponse,
  ModelAState,
  ModelBState,
  PairingResponse,
  PredictAllResponse,
  ProtocolStep,
  RoutePoint,
  Scenario,
  SensorInput,
  SensorPacket,
  SummaryResponse,
  TriageRequest,
  TriageResponse,
  ZoneId,
} from './types';

type LocationLike = Pick<Location, 'hostname' | 'protocol' | 'port'>;

export function getApiBase(loc: LocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined): string {
  if (loc) {
    const host = loc.hostname;
    const protocol = loc.protocol;
    if (process.env.NEXT_PUBLIC_API_BASE) {
      if (host !== 'localhost' && host !== '127.0.0.1' && process.env.NEXT_PUBLIC_API_BASE.includes('localhost')) {
        return `${protocol}//${host}:8000`;
      }
      return process.env.NEXT_PUBLIC_API_BASE.replace(/\/$/, '');
    }
    // Served on the default port (HTTPS proxy on :443 / a cloud reverse proxy): API is same-origin.
    if (!loc.port) {
      return `${protocol}//${host}`;
    }
    return `${protocol}//${host}:8000`;
  }
  return (process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '');
}

const endpoint = (path: string) => `${getApiBase()}${path}`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null;
    throw new Error(body?.detail ?? body?.error ?? `A.E.G.I.S. API returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/** "Crew_A" / "crew a" / "A" -> "A". Uses the last letter: "CREW_A" itself contains a "C". */
export function normalizeCrewId(raw: any): CrewId {
  const letter = String(raw || 'A').trim().toUpperCase().slice(-1);
  return (['A', 'B', 'C', 'D'] as string[]).includes(letter) ? (letter as CrewId) : 'A';
}

/** Backend organ zone keys (core_math.calculate_organ_scores) -> console zone ids. */
const BACKEND_ZONES: Record<ZoneId, string> = {
  cns: 'cns_brain',
  cardio: 'cardiovascular',
  resp: 'respiratory',
  thermo: 'immune_thermo',
  metabolic: 'metabolic_nutrition',
  musculo: 'musculoskeletal',
};

function zoneScore(source: any, zone: ZoneId): number | undefined {
  const value = source?.[BACKEND_ZONES[zone]] ?? source?.[zone];
  const score = typeof value === 'object' && value !== null ? value.score : value;
  return score === undefined || score === null ? undefined : Number(score);
}

/** Accepts {cns_brain: {score}} (backend) as well as {cns: 85} (mock) in organ_scores / organ_scores_6. */
function parseOrganScores(raw: any): Record<ZoneId, number> {
  const out = {} as Record<ZoneId, number>;
  for (const zone of Object.keys(BACKEND_ZONES) as ZoneId[]) {
    out[zone] = zoneScore(raw.organ_scores, zone) ?? zoneScore(raw.organ_scores_6, zone) ?? 85;
  }
  return out;
}

export function normalizeEnvId(raw: any): EnvId {
  const s = String(raw || '').toLowerCase();
  if (s.includes('crater') || s.includes('surface') || s.includes('suit') || s.includes('eva')) return 'crater_eva';
  if (s.includes('moon') || s.includes('habitat') || s.includes('lunar') || s.includes('base')) return 'moon_base';
  if (s.includes('rover')) return 'rover';
  if (s.includes('mars') || s.includes('spacecraft') || s.includes('transit')) return 'mars_transit';
  if (s.includes('orbit') || s.includes('station')) return 'orbit_station';
  return 'crater_eva';
}

export function toBackendEnv(env: EnvId | string): string {
  const s = String(env || '').toLowerCase();
  if (s === 'crater_eva' || s.includes('surface') || s.includes('suit') || s.includes('eva') || s.includes('crater')) return 'surface_eva_spacesuit';
  if (s === 'moon_base' || s.includes('habitat') || s.includes('lunar') || s.includes('base')) return 'lunar_base_habitat';
  if (s === 'rover') return 'pressurized_rover';
  if (s === 'mars_transit' || s.includes('mars') || s.includes('transit') || s.includes('spacecraft')) return 'spacecraft_mars_transit';
  if (s === 'orbit_station' || s.includes('orbit') || s.includes('station')) return 'space_station_orbital';
  return 'surface_eva_spacesuit';
}

function createInitialCrewState(crew: CrewId): CrewState {
  return {
    crew,
    vitals: {
      crew,
      t: 0,
      env: 'crater_eva',
      hr: 74,
      sys: 118,
      dia: 76,
      spo2: 98.4,
      resp: 15,
      st: 0.005,
      temp: 36.7,
      blood_sugar_mgdl: 92,
      smo2: 78.5,
      emg_mdf: -2,
      gait: 0.22,
      slope: 3,
      speed: 2.5,
      o2_left: 680,
      fall: false,
      nirs_ok: true,
      dizzy: false,
    },
    band: 'green',
    organ_scores_6: {
      cns: 85,
      cardio: 85,
      resp: 95,
      thermo: 94,
      metabolic: 88,
      musculo: 89,
    },
    model_a: {
      fatigue_score: 15.2,
      legs_fail_min: 45,
      fallback: false,
    },
    model_b: {
      metabolic_w: 280.5,
      o2_burn_l_min: 0.88,
      o2_left_pct: 90.7,
      walk_back_min: 45.2,
      distance_m: 1850,
    },
  };
}

function parseCrewState(raw: any, crewId: CrewId): CrewState {
  const organScores = parseOrganScores(raw);

  const v = raw.vitals || {};
  const vitals: SensorPacket = {
    crew: crewId,
    t: Number(raw.t ?? v.t ?? 0),
    env: normalizeEnvId(raw.env ?? v.env ?? 'crater_eva'),
    hr: Number(v.hr ?? 72),
    sys: Number(v.sys ?? 120),
    dia: Number(v.dia ?? 80),
    spo2: Number(v.spo2 ?? 98),
    resp: Number(v.resp ?? 14),
    st: Number(v.st ?? 0),
    temp: Number(v.temp ?? 36.7),
    blood_sugar_mgdl: Number(v.blood_sugar_mgdl ?? 95),
    smo2: Number(v.smo2 ?? 75),
    emg_mdf: Number(v.emg_mdf ?? -2),
    gait: Number(v.gait ?? 0.15),
    slope: Number(v.slope ?? 3),
    speed: Number(v.speed ?? 2.5),
    o2_left: Number(v.o2_left ?? 680),
    fall: Boolean(v.fall),
    nirs_ok: v.nirs_ok !== undefined ? Boolean(v.nirs_ok) : true,
    dizzy: Boolean(v.dizzy),
  };

  const band: Band = (raw.composite_band ?? raw.band ?? raw.traffic_light ?? 'green') as Band;

  const model_a: ModelAState = {
    fatigue_score: Number(raw.model_a?.fatigue_score ?? 15),
    // null = fatigue stable / recovering (Model A projects no leg failure)
    legs_fail_min: (() => {
      const v = raw.model_a?.legs_fail_in_min !== undefined ? raw.model_a.legs_fail_in_min : raw.model_a?.legs_fail_min;
      return v === null || v === undefined ? null : Number(v);
    })(),
    fallback: Boolean(raw.model_a?.nirs_fogged ?? raw.model_a?.fallback ?? !vitals.nirs_ok),
  };

  const model_b: ModelBState = {
    metabolic_w: Number(raw.model_b?.metabolic_rate_watts ?? raw.model_b?.metabolic_w ?? 280),
    o2_burn_l_min: Number(raw.model_b?.o2_burn_rate_l_min ?? raw.model_b?.o2_burn_l_min ?? 0.85),
    o2_left_pct: Number(raw.model_b?.o2_left_pct ?? 90),
    walk_back_min: Number(
      raw.walk_back?.minutes !== undefined
        ? raw.walk_back.minutes
        : (raw.model_b?.walk_back_limit_min ?? raw.model_b?.walk_back_min ?? 45)
    ),
    distance_m: Number(raw.walk_back?.distance_from_base_m ?? raw.route_position?.distance_m ?? v.distance_m ?? 1850),
  };

  return {
    crew: crewId,
    vitals,
    band,
    organ_scores_6: organScores,
    model_a,
    model_b,
    alarm: raw.alarm ?? null,
    fall_countdown_s: raw.fall_countdown_s !== undefined ? raw.fall_countdown_s : null,
    scenario: raw.scenario ?? null,
  };
}

function normalizeTriage(raw: any): TriageResponse {
  const ranked = (raw.ranked_other_classes ?? []).map((r: any) => ({
    class_name: r.class_name ?? r.class ?? 'Nominal',
    confidence: Number(r.confidence ?? r.probability ?? 0),
  }));

  const steps: ProtocolStep[] = (raw.protocol_steps ?? []).map((s: any, idx: number) => {
    const title = String(s.title ?? (typeof s === 'string' ? s.slice(0, 40) : ''));
    const action = String(s.action ?? s.instruction ?? (typeof s === 'string' ? s : ''));
    let diagram: ProtocolStep['diagram'] = 'none';
    const textLower = `${title} ${action}`.toLowerCase();
    if (/\baed\b|defibrillator/.test(textLower)) {
      diagram = 'aed';
    } else if (textLower.includes('position') || textLower.includes('sitting') || textLower.includes('elevat') || textLower.includes('posture')) {
      diagram = 'position';
    } else if (textLower.includes('oxygen') || textLower.includes('o2') || textLower.includes('mask')) {
      diagram = 'oxygen';
    } else if (textLower.includes('bay') || textLower.includes('cabinet') || textLower.includes('kit')) {
      diagram = 'bay';
    }
    return {
      order: Number(s.order ?? s.step ?? idx + 1),
      title,
      instruction: action,
      diagram,
    };
  });

  const dontGive: string[] = (raw.dont_give_list ?? []).map((d: any) => {
    if (typeof d === 'string') return d;
    return d.banner ?? `${d.drug}: ${d.reason}`;
  });

  return {
    primary_class: raw.primary_class ?? 'Nominal',
    ranked_other_classes: ranked,
    tree_path_why: raw.tree_path_why ?? '',
    dont_give_list: dontGive,
    protocol_steps: steps,
    flight_surgeons_queued: Boolean(raw.flight_surgeons_queued),
    ultrasound_attached: Boolean(raw.ultrasound_attached),
  };
}

function normalizeEvening(raw: any, crewId?: CrewId): EveningResponse {
  const organScores = parseOrganScores(raw);

  const quests: string[] = Array.isArray(raw.completed_quests)
    ? raw.completed_quests
    : raw.completed_quests && typeof raw.completed_quests === 'object'
      ? Object.keys(raw.completed_quests).filter(k => raw.completed_quests[k])
      : [];

  return {
    crew: crewId ?? normalizeCrewId(raw.crew_id ?? raw.crew ?? 'A'),
    readiness_score: Number(raw.readiness_score ?? 80),
    band: (raw.band ?? 'green') as Band,
    mismatch_detected: Boolean(raw.mismatch_detected ?? raw.masking_detected),
    mismatch_text: raw.mismatch_text ?? null,
    forecast_curve_no_rest: Array.isArray(raw.forecast_curve_no_rest) ? raw.forecast_curve_no_rest : [],
    forecast_curve_with_quests: Array.isArray(raw.forecast_curve_with_quests) ? raw.forecast_curve_with_quests : [],
    organ_scores_6: organScores,
    applied_quests: quests,
  };
}

function normalizeSummary(raw: any): SummaryResponse {
  return {
    text: raw.commander_summary ?? raw.text ?? '',
    citations: Array.isArray(raw.standard_citations)
      ? raw.standard_citations
      : Array.isArray(raw.citations)
        ? raw.citations
        : [],
    source: raw.source ?? 'RAG-LLM (NASA-STD-3001)',
  };
}

function normalizeScenarios(raw: any): Scenario[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw.scenarios === 'object') {
    return Object.values(raw.scenarios);
  }
  return [];
}

function normalizeHistory(raw: any, id: CrewId): CrewHistory {
  return {
    id,
    name: raw.name ?? `Astronaut ${id}`,
    role: raw.role ?? 'Crew Member',
    assignment: raw.assignment ?? 'Primary Surface Operator',
    status_band: raw.status_band ?? 'green',
    current_sol: Number(raw.current_sol ?? 14),
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

function normalizeRoute(raw: any): RoutePoint[] {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.points)) return raw.points;
  return [];
}

export const aegisApi: AegisTransport = {
  subscribeConsole(cb, onStatus) {
    let unmounted = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const currentFrame: ConsoleFrame = {
      env: 'crater_eva',
      crews: {
        A: createInitialCrewState('A'),
        B: createInitialCrewState('B'),
        C: createInitialCrewState('C'),
        D: createInitialCrewState('D'),
      },
      events: [],
      emitted_at: new Date().toISOString(),
    };

    let emitPending = false;
    function emit() {
      if (unmounted || emitPending) return;
      emitPending = true;
      queueMicrotask(() => {
        emitPending = false;
        if (unmounted) return;
        cb({
          ...currentFrame,
          crews: { ...currentFrame.crews },
          events: [...currentFrame.events],
        });
      });
    }

    function scheduleReconnect() {
      if (unmounted || reconnectTimer) return;
      onStatus?.(false);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    }

    function connect() {
      if (unmounted) return;
      try {
        if (ws) {
          try { ws.close(); } catch {}
          ws = null;
        }

        const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
        const wsScheme = isHttps ? 'wss:' : 'ws:';
        const base = getApiBase();
        const wsHost = base.replace(/^https?:\/\//, '');
        const wsUrl = `${wsScheme}//${wsHost}/ws/console`;

        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          if (unmounted) return;
          onStatus?.(true);
        };

        ws.onmessage = event => {
          if (unmounted) return;
          try {
            const envelope = JSON.parse(event.data);
            const type = envelope.type;
            const data = envelope.data;

            if (type === 'hello') {
              if (data?.crews) {
                for (const [key, cData] of Object.entries(data.crews)) {
                  const cid = normalizeCrewId(key);
                  currentFrame.crews[cid] = parseCrewState(cData, cid);
                }
              }
              if (Array.isArray(data?.events)) {
                currentFrame.events = data.events.map((e: any) => ({
                  type: (e.kind ?? e.type ?? 'ack') as ConsoleEventType,
                  crew: normalizeCrewId(e.crew ?? 'A'),
                  ts: e.ts ?? new Date().toISOString(),
                  text: e.text ?? '',
                }));
              }
              if (currentFrame.crews['A']?.vitals?.env) {
                currentFrame.env = normalizeEnvId(currentFrame.crews['A'].vitals.env);
              }
              currentFrame.emitted_at = envelope.ts ?? new Date().toISOString();
              emit();
            } else if (type === 'state') {
              const cid = normalizeCrewId(envelope.crew ?? data?.crew ?? 'A');
              currentFrame.crews[cid] = parseCrewState(data, cid);
              if (data?.env) currentFrame.crews[cid].vitals.env = normalizeEnvId(data.env);
              currentFrame.emitted_at = envelope.ts ?? new Date().toISOString();
              emit();
            } else if (type === 'event') {
              const newEvent: ConsoleEvent = {
                type: (data?.kind ?? data?.type ?? 'ack') as ConsoleEventType,
                crew: normalizeCrewId(data?.crew ?? envelope.crew ?? 'A'),
                ts: data?.ts ?? envelope.ts ?? new Date().toISOString(),
                text: data?.text ?? '',
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            } else if (type === 'fall_countdown') {
              const cid = normalizeCrewId(envelope.crew ?? data?.crew ?? 'A');
              if (currentFrame.crews[cid]) {
                currentFrame.crews[cid].fall_countdown_s = Number(data?.seconds ?? 30);
                currentFrame.crews[cid].vitals.fall = true;
              }
              const newEvent: ConsoleEvent = {
                type: 'alarm_jump_to_emergency',
                crew: cid,
                ts: envelope.ts ?? new Date().toISOString(),
                text: `CRITICAL ALERT: Crew ${cid} fall detected — 30s rescue countdown armed`,
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            } else if (type === 'sos_auto_escalated') {
              const cid = normalizeCrewId(envelope.crew ?? data?.crew ?? 'A');
              const newEvent: ConsoleEvent = {
                type: 'alarm_jump_to_emergency',
                crew: cid,
                ts: envelope.ts ?? new Date().toISOString(),
                text: `AUTOMATIC RESCUE ESCALATION: Crew ${cid} no response — suit CO2 flush & beacon active`,
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            } else if (type === 'reset') {
              if (data?.crews) {
                for (const [key, cData] of Object.entries(data.crews)) {
                  const cid = normalizeCrewId(key);
                  currentFrame.crews[cid] = parseCrewState(cData, cid);
                }
              }
              emit();
            } else if (type === 'alarm_jump_to_emergency') {
              const cid = normalizeCrewId(envelope.crew ?? data?.crew ?? 'A');
              if (data?.state) {
                currentFrame.crews[cid] = parseCrewState(data.state, cid);
              }
              const newEvent: ConsoleEvent = {
                type: 'alarm_jump_to_emergency',
                crew: cid,
                ts: envelope.ts ?? new Date().toISOString(),
                text: `EMERGENCY TRIGGERED: ${Array.isArray(data?.reasons) ? data.reasons.join(', ') : 'Critical Vitals / Fall in Crater'}`,
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            } else if (type === 'routine_prompt') {
              const newEvent: ConsoleEvent = {
                type: 'routine_prompt',
                crew: 'A',
                ts: envelope.ts ?? new Date().toISOString(),
                text: data?.text ?? 'Routine medical check prompt',
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            } else if (type === 'reset') {
              if (data?.crews) {
                for (const [key, cData] of Object.entries(data.crews)) {
                  const cid = normalizeCrewId(key);
                  currentFrame.crews[cid] = parseCrewState(cData, cid);
                }
              }
              const newEvent: ConsoleEvent = {
                type: 'ack',
                crew: 'A',
                ts: envelope.ts ?? new Date().toISOString(),
                text: 'Nominal baseline reset for all crew members',
              };
              currentFrame.events = [newEvent, ...currentFrame.events.slice(0, 49)];
              emit();
            }
            onStatus?.(true);
          } catch {
            // ignore parsing error
          }
        };

        ws.onerror = () => {
          scheduleReconnect();
        };

        ws.onclose = () => {
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  },

  sendSensors(packet: SensorInput) {
    if (packet.scenario === 'reset_all') {
      return requestJson('/api/reset', { method: 'POST' }).then(() => undefined);
    }
    // Partial packets (e.g. phone tilt {crew, slope}) must stay partial: defaulting the flags here
    // sent fall=0 between shakes, so every shake looked like a new fall and restarted the countdown.
    const payload: any = {
      type: packet.scenario ? 'scenario' : 'telemetry',
      crew: `Crew_${packet.crew ?? 'A'}`,
      scenario: packet.scenario,
      ...packet,
    };
    if (packet.fall !== undefined) payload.fall = packet.fall ? 1 : 0;
    if (packet.nirs_ok !== undefined) payload.nirs_ok = packet.nirs_ok ? 1 : 0;
    if (packet.dizzy !== undefined) payload.dizzy = packet.dizzy ? 1 : 0;
    if (packet.env) {
      payload.env = toBackendEnv(packet.env);
    }
    return requestJson('/api/sensors', { method: 'POST', body: JSON.stringify(payload) }).then(() => undefined);
  },

  async triage(request: TriageRequest): Promise<TriageResponse> {
    const symptoms = request.symptoms ?? [];
    const payload = {
      crew: `Crew_${request.crew ?? 'A'}`,
      vitals: request.vitals ?? {},
      symptom_flags: {
        chest_pain: symptoms.includes('chest_pain'),
        dizzy: symptoms.includes('dizziness'),
        short_breath: symptoms.includes('shortness_of_breath'),
        cold_sweat: symptoms.includes('cold_sweat' as any),
        fall_event: symptoms.includes('fall'),
      },
      transcript: request.text,
      ultrasound_attached: Boolean(request.ultrasound_attached),
    };
    const raw = await requestJson<any>('/api/triage', { method: 'POST', body: JSON.stringify(payload) });
    return normalizeTriage(raw);
  },

  async evening(request: EveningRequest): Promise<EveningResponse> {
    const payload = {
      crew: `Crew_${request.crew ?? 'A'}`,
      sleep: request.answers.sleep,
      energy: request.answers.energy,
      mood: request.answers.mood,
      pain_free: request.answers.pain_free,
      nutrition: request.answers.nutrition,
      blood_sugar_mgdl: request.blood_sugar_mgdl,
      bp_sys: request.bp_sys,
      bp_dia: request.bp_dia,
      temp: request.body_temp_c,
      completed_quests: request.quest_ids ?? [],
    };
    const raw = await requestJson<any>('/api/evening', { method: 'POST', body: JSON.stringify(payload) });
    return normalizeEvening(raw, request.crew);
  },

  async summary(response: EveningResponse): Promise<SummaryResponse> {
    // The backend keeps the full result of the crew's last POST /evening (objective score,
    // vitals, delta ...). The normalized EveningResponse drops those fields, so send only
    // the crew id and let the Commander briefing use the complete server-side check-in.
    const cid = `Crew_${response.crew ?? 'A'}`;
    const raw = await requestJson<any>('/api/summary', {
      method: 'POST',
      body: JSON.stringify({ crew: cid }),
    });
    return normalizeSummary(raw);
  },

  postEvent(event: ConsoleEventInput) {
    const payload = {
      type: event.type,
      crew: `Crew_${event.crew ?? 'A'}`,
      text: event.text,
      payload: { text: event.text },
    };
    return requestJson('/api/events', { method: 'POST', body: JSON.stringify(payload) }).then(() => undefined);
  },

  async getScenarios(): Promise<Scenario[]> {
    const raw = await requestJson<any>('/api/scenarios');
    return normalizeScenarios(raw);
  },

  async getCrewHistory(id: CrewId): Promise<CrewHistory> {
    const raw = await requestJson<any>(`/api/crew/${id}/history`);
    return normalizeHistory(raw, id);
  },

  async getRouteProfile(): Promise<RoutePoint[]> {
    const raw = await requestJson<any>('/api/route-profile');
    return normalizeRoute(raw);
  },

  async getPairing(crew: CrewId): Promise<PairingResponse> {
    try {
      const raw = await requestJson<any>(`/api/pairing?crew=${crew}`);
      if (raw.url) return { url: raw.url, crew };
    } catch {
      // ignore
    }
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const port = typeof window !== 'undefined' ? window.location.port : '3000';
    return {
      url: `http://${host}${port ? `:${port}` : ''}/phone?crew=${crew}`,
      crew,
    };
  },

  async predictAll(telemetry: Partial<SensorPacket>): Promise<PredictAllResponse> {
    const payload: any = {
      crew: telemetry.crew ? `Crew_${telemetry.crew}` : 'Crew_A',
      ...telemetry,
      fall: telemetry.fall ? 1 : 0,
      nirs_ok: telemetry.nirs_ok !== false ? 1 : 0,
      dizzy: telemetry.dizzy ? 1 : 0,
    };
    if (telemetry.env) {
      payload.env = toBackendEnv(telemetry.env);
    }
    return requestJson<PredictAllResponse>('/api/predict_all', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
