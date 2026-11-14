export type CrewId = 'A' | 'B' | 'C' | 'D';
export type EnvId = 'moon_base' | 'crater_eva' | 'rover' | 'mars_transit' | 'orbit_station';
export type Band = 'green' | 'amber' | 'red';
export type ZoneId = 'cns' | 'cardio' | 'resp' | 'thermo' | 'metabolic' | 'musculo';
export type ConsoleMode = 'body_map' | 'mode1' | 'mode2' | 'mode3';
export type ConsoleEventType = 'alarm_jump_to_emergency' | 'visor_instruction' | 'ack' | 'commander_decision' | 'routine_prompt';

export const CREW_IDS: CrewId[] = ['A', 'B', 'C', 'D'];

export interface SensorPacket {
  crew: CrewId;
  t: number;
  env: EnvId;
  hr: number;
  sys: number;
  dia: number;
  spo2: number;
  resp: number;
  st: number;
  temp: number;
  blood_sugar_mgdl: number;
  smo2: number;
  emg_mdf: number;
  gait: number;
  slope: number;
  speed: number;
  o2_left: number;
  fall: boolean;
  nirs_ok: boolean;
  dizzy: boolean;
  distance_m?: number;
}

export type SensorInput = Partial<Omit<SensorPacket, 'crew'>> & {
  crew: CrewId;
  scenario?: string;
};

export interface ModelAState {
  fatigue_score: number;
  /** null = fatigue stable or recovering (no projected leg failure) */
  legs_fail_min: number | null;
  fallback: boolean;
}

export interface ModelBState {
  metabolic_w: number;
  o2_burn_l_min: number;
  o2_left_pct: number;
  walk_back_min: number;
  distance_m?: number;
}

export interface CrewState {
  crew: CrewId;
  vitals: SensorPacket;
  band: Band;
  organ_scores_6: Record<ZoneId, number>;
  model_a: ModelAState;
  model_b: ModelBState;
  alarm?: { level: string; reasons: string[]; since?: number } | null;
  fall_countdown_s?: number | null;
  scenario?: string | null;
}

export interface ConsoleEvent {
  type: ConsoleEventType;
  crew: CrewId;
  ts: string;
  text: string;
}

export interface ConsoleFrame {
  env: EnvId;
  crews: Record<CrewId, CrewState>;
  events: ConsoleEvent[];
  emitted_at: string;
}

export interface Scenario {
  id: string;
  name: string;
  badge: string;
  badge_color: string;
  description: string;
  mode_target: string;
  initial_state: Partial<SensorPacket>;
}

export interface RoutePoint {
  point_idx: number;
  distance_m: number;
  elevation_m: number;
  slope_deg: number;
}

export interface CrewHistoryPoint {
  sol: number;
  is_eva_day: boolean;
  calf_smo2_pct: number;
  cum_bone_load_g: number;
  sleep_hours: number;
  blood_sugar_mgdl: number;
  resting_hr_bpm: number;
  body_temp_c: number;
  objective_sensor_score: number;
  subjective_energy_slider: number;
  subjective_sleep_slider: number;
  subjective_mood_slider: number;
  subjective_pain_free_slider: number;
  subjective_nutrition_slider: number;
  mismatch_detected: boolean;
  masking_detected: boolean;
}

export interface CrewHistory {
  id: string;
  name: string;
  role: string;
  assignment: string;
  status_band: string;
  current_sol: number;
  history: CrewHistoryPoint[];
}

export type SymptomId = 'chest_pain' | 'shortness_of_breath' | 'dizziness' | 'fall' | 'nausea' | 'headache';

export interface TriageRequest {
  crew: CrewId;
  symptoms: SymptomId[];
  vitals?: Partial<SensorPacket>;
  text?: string;
  ultrasound_attached?: boolean;
}

export interface TriageClassRank {
  class_name: string;
  confidence: number;
}

export interface ProtocolStep {
  order: number;
  title: string;
  instruction: string;
  diagram: 'position' | 'oxygen' | 'bay' | 'aed' | 'none';
}

export interface TriageResponse {
  primary_class: string;
  ranked_other_classes: TriageClassRank[];
  tree_path_why: string;
  dont_give_list: string[];
  protocol_steps: ProtocolStep[];
  flight_surgeons_queued: boolean;
  ultrasound_attached: boolean;
}

export interface EveningAnswers {
  sleep: number;
  energy: number;
  mood: number;
  pain_free: number;
  nutrition: number;
}

export interface EveningRequest {
  crew: CrewId;
  answers: EveningAnswers;
  blood_sugar_mgdl: number;
  bp_sys: number;
  bp_dia: number;
  body_temp_c: number;
  fatigue_score?: number;
  quest_ids?: string[];
}

export interface EveningResponse {
  crew?: CrewId;
  readiness_score: number;
  band: Band;
  mismatch_detected: boolean;
  mismatch_text: string | null;
  subjective_score?: number;
  objective_score?: number;
  forecast_curve_no_rest: number[];
  forecast_curve_with_quests: number[];
  organ_scores_6: Record<ZoneId, number>;
  applied_quests: string[];
}

export interface SummaryResponse {
  text: string;
  citations: string[];
  source: string;
}

export interface ConsoleEventInput {
  type: ConsoleEventType;
  crew: CrewId;
  text: string;
}

export interface PairingResponse {
  url: string;
  crew: CrewId;
}

export interface AegisTransport {
  subscribeConsole(cb: (frame: ConsoleFrame) => void, onStatus?: (connected: boolean) => void): () => void;
  sendSensors(packet: SensorInput): Promise<void>;
  triage(request: TriageRequest): Promise<TriageResponse>;
  evening(request: EveningRequest): Promise<EveningResponse>;
  summary(response: EveningResponse): Promise<SummaryResponse>;
  postEvent(event: ConsoleEventInput): Promise<void>;
  getScenarios(): Promise<Scenario[]>;
  getCrewHistory(id: CrewId): Promise<CrewHistory>;
  getRouteProfile(): Promise<RoutePoint[]>;
  getPairing(crew: CrewId): Promise<PairingResponse>;
  predictAll(telemetry: Partial<SensorPacket>): Promise<PredictAllResponse>;
}
export interface PredictAllResponse {
  crew_id: string;
  t: number;
  env: string;
  health_score: number;
  band: Band | string;
  traffic_light?: Band;
  composite_band?: Band;
  status_label: string;
  model_a: {
    muscle_fatigue_score: number;
    fatigue_score: number;
    time_to_failure_min: number;
    legs_fail_min: number;
    legs_fail_in_min?: number;
    model_used: string;
    nirs_active: boolean;
    fallback: boolean;
  };
  model_b: {
    metabolic_rate_watts: number;
    metabolic_w: number;
    o2_burn_rate_l_min: number;
    o2_burn_l_min: number;
    walk_back_limit_min: number;
    walk_back_min: number;
    o2_tank_remaining_l: number;
    o2_left_pct: number;
    model_used: string;
    point_of_no_return_warning: boolean;
  };
  model_c: TriageResponse & {
    confidence: number;
    ranked: Array<{ class: string; probability: number }>;
    tree_path: string;
    dont_give_nitro: boolean;
    nitroglycerin_alert: string | null;
    oxygen_surge: boolean;
    oxygen_alert: string | null;
    flight_surgeons_alert: boolean;
    model: string;
  };
}

