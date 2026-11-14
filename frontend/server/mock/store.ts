import scenarioSeed from './seed/scenarios.json';
import historySeed from './seed/crew_history.json';
import routeSeed from './seed/route_profile.json';
import { CREW_IDS, type ConsoleEvent, type ConsoleFrame, type CrewHistory, type CrewId, type CrewState, type EnvId, type RoutePoint, type Scenario, type SensorInput, type SensorPacket } from '../../lib/api/types';
import { deriveCrewState } from './engine';

interface RawScenarioPoint extends Record<string, string | number> {
  t: number;
  env: string;
  crew: string;
}

interface RawScenario {
  id: string;
  name: string;
  badge: string;
  badge_color: string;
  description: string;
  mode_target: string;
  initial_state: Record<string, number>;
  timeline_60s: RawScenarioPoint[];
}

interface ScenarioFile { scenarios: Record<string, RawScenario> }
interface HistoryFile { crew: Record<string, CrewHistory> }
interface ActiveScenario { id: string; startedAt: number; lastPoint: RawScenarioPoint }
interface MockStoreState {
  env: EnvId;
  crews: Record<CrewId, CrewState>;
  events: ConsoleEvent[];
  activeScenarios: Partial<Record<CrewId, ActiveScenario>>;
  listeners: Set<(frame: ConsoleFrame) => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const scenarios = (scenarioSeed as unknown as ScenarioFile).scenarios;
const histories = (historySeed as unknown as HistoryFile).crew;
const routeProfile = routeSeed as RoutePoint[];
const globalStore = globalThis as typeof globalThis & { __aegisMockStore?: MockStoreState };

function defaultPacket(crew: CrewId, env: EnvId, index: number): SensorPacket {
  const baseline = scenarios.normal_walk.initial_state;
  return {
    crew,
    t: 0,
    env,
    hr: baseline.hr + index * 2,
    sys: baseline.sys - index,
    dia: baseline.dia,
    spo2: baseline.spo2 - index * 0.15,
    resp: baseline.resp,
    st: baseline.st,
    temp: baseline.temp,
    blood_sugar_mgdl: baseline.blood_sugar_mgdl + index * 2,
    smo2: baseline.smo2 - index * 1.5,
    emg_mdf: baseline.emg_mdf,
    gait: baseline.gait + index * 0.015,
    slope: baseline.slope,
    speed: baseline.speed,
    o2_left: baseline.o2_left,
    fall: false,
    nirs_ok: Boolean(baseline.nirs_ok),
    dizzy: false,
  };
}

function emptyStore(): MockStoreState {
  const env: EnvId = 'crater_eva';
  const crewEntries = CREW_IDS.map((crew, index) => [crew, deriveCrewState(defaultPacket(crew, env, index))] as const);
  return { env, crews: Object.fromEntries(crewEntries) as Record<CrewId, CrewState>, events: [], activeScenarios: {}, listeners: new Set(), timer: null };
}

function snapshot(store: MockStoreState): ConsoleFrame {
  return {
    env: store.env,
    crews: store.crews,
    events: store.events.slice(-20),
    emitted_at: new Date().toISOString(),
  };
}

function publish(store: MockStoreState) {
  const frame = snapshot(store);
  store.listeners.forEach(listener => listener(frame));
}

function addEvent(store: MockStoreState, event: Omit<ConsoleEvent, 'ts'>) {
  store.events.push({ ...event, ts: new Date().toISOString() });
  if (store.events.length > 100) store.events.splice(0, store.events.length - 100);
}

function packetFromScenario(current: SensorPacket, point: RawScenarioPoint): SensorPacket {
  const packet = { ...current, t: point.t };
  const values = packet as unknown as Record<string, unknown>;
  for (const [key, rawValue] of Object.entries(point)) {
    if (key === 't' || key === 'crew' || key === 'env') continue;
    if (key === 'fall' || key === 'nirs_ok' || key === 'dizzy') {
      values[key] = Number(rawValue) > 0;
    } else if (typeof rawValue === 'number' && key in packet) {
      values[key] = rawValue;
    }
  }
  return packet;
}

function applyScenarioPoint(store: MockStoreState, crew: CrewId, point: RawScenarioPoint) {
  const packet = packetFromScenario(store.crews[crew].vitals, point);
  store.crews[crew] = deriveCrewState({ ...packet, env: store.env });
}

function resetStore(store: MockStoreState) {
  store.env = 'crater_eva';
  store.activeScenarios = {};
  store.events = [];
  store.crews = Object.fromEntries(CREW_IDS.map((crew, index) => [crew, deriveCrewState(defaultPacket(crew, store.env, index))])) as Record<CrewId, CrewState>;
}

function tick(store: MockStoreState) {
  const now = Date.now();
  for (const crew of CREW_IDS) {
    const active = store.activeScenarios[crew];
    if (!active) continue;
    const timeline = scenarios[active.id].timeline_60s;
    const elapsed = Math.min(timeline.length - 1, Math.floor((now - active.startedAt) / 1000));
    const point = timeline[elapsed] ?? active.lastPoint;
    active.lastPoint = point;
    applyScenarioPoint(store, crew, point);
  }
  publish(store);
}

export function getMockStore(): MockStoreState {
  if (!globalStore.__aegisMockStore) globalStore.__aegisMockStore = emptyStore();
  const store = globalStore.__aegisMockStore;
  if (!store.timer) {
    store.timer = setInterval(() => tick(store), 1000);
    if (typeof store.timer === 'object' && store.timer) (store.timer as NodeJS.Timeout).unref();
  }
  return store;
}

export function getConsoleFrame(): ConsoleFrame {
  return snapshot(getMockStore());
}

export function subscribeConsole(listener: (frame: ConsoleFrame) => void) {
  const store = getMockStore();
  store.listeners.add(listener);
  listener(snapshot(store));
  return () => store.listeners.delete(listener);
}

export function sendSensors(input: SensorInput) {
  const store = getMockStore();
  const { crew, scenario, ...sensorValues } = input;
  const previous = store.crews[crew].vitals;

  if (scenario === 'reset_all') {
    resetStore(store);
    publish(store);
    return;
  }

  if (sensorValues.env) {
    store.env = sensorValues.env;
    for (const id of CREW_IDS) store.crews[id] = deriveCrewState({ ...store.crews[id].vitals, env: store.env });
  }

  if (scenario && scenarios[scenario]) {
    const scenarioData = scenarios[scenario];
    const now = Date.now();
    const firstPoint = scenarioData.timeline_60s[0];
    store.activeScenarios[crew] = { id: scenario, startedAt: now, lastPoint: firstPoint };
    const initial = packetFromScenario(previous, { ...firstPoint, ...scenarioData.initial_state, t: 0, crew: `Crew_${crew}`, env: String(store.env) });
    store.crews[crew] = deriveCrewState({ ...initial, env: store.env });
    if (scenario === 'fall_in_crater' || scenario === 'chest_pain') {
      addEvent(store, { type: 'alarm_jump_to_emergency', crew, text: scenarioData.name });
    }
  } else {
    delete store.activeScenarios[crew];
    const next = { ...previous, ...sensorValues, crew, t: Date.now() } as SensorPacket;
    if (next.env) store.env = next.env;
    next.env = store.env;
    store.crews[crew] = deriveCrewState(next);
    if (next.fall && !previous.fall) addEvent(store, { type: 'alarm_jump_to_emergency', crew, text: 'Fall detected by crew sensor simulator' });
  }

  publish(store);
}

export function postConsoleEvent(event: Omit<ConsoleEvent, 'ts'>) {
  const store = getMockStore();
  addEvent(store, event);
  publish(store);
}

export function getScenarios(): Scenario[] {
  return Object.values(scenarios).map(({ timeline_60s: _timeline, ...scenario }) => {
    const state = scenario.initial_state;
    return {
      ...scenario,
      initial_state: {
        hr: state.hr,
        sys: state.sys,
        dia: state.dia,
        spo2: state.spo2,
        resp: state.resp,
        st: state.st,
        temp: state.temp,
        blood_sugar_mgdl: state.blood_sugar_mgdl,
        smo2: state.smo2,
        emg_mdf: state.emg_mdf,
        gait: state.gait,
        slope: state.slope,
        speed: state.speed,
        o2_left: state.o2_left,
        fall: Boolean(state.fall),
        nirs_ok: Boolean(state.nirs_ok),
        dizzy: Boolean(state.dizzy),
      },
    };
  });
}

export function getCrewHistory(crew: CrewId): CrewHistory {
  return histories[`Crew_${crew}`];
}

export function getRouteProfile() {
  return routeProfile;
}
