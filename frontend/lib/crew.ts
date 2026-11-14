import type { CrewId, CrewState, EnvId } from './api/types';
import { scoreTone } from './status';
import type { Band } from './api/types';

export const crewMeta: Record<CrewId, { name: string; role: string }> = {
  A: { name: 'Astronaut A', role: 'EVA specialist' },
  B: { name: 'Astronaut B', role: 'Systems engineer' },
  C: { name: 'Astronaut C', role: 'Flight surgeon' },
  D: { name: 'Astronaut D', role: 'Geology specialist' },
};

export const environments: Array<{ id: EnvId; title: string; gravity: string; note: string }> = [
  { id: 'crater_eva', title: 'Lunar crater EVA', gravity: '0.16 g', note: 'Spacesuit · Shackleton rim' },
  { id: 'moon_base', title: 'Lunar base habitat', gravity: '0.16 g', note: 'Shirt-sleeve habitat' },
  { id: 'rover', title: 'Pressurized rover', gravity: '0.16 g', note: 'Traverse cabin' },
  { id: 'mars_transit', title: 'Mars transit', gravity: '0 g', note: 'Up to 22 min comm delay' },
  { id: 'orbit_station', title: 'Orbital station', gravity: '0 g', note: 'Microgravity' },
];

export const envTitle = (env: EnvId) => environments.find(e => e.id === env)?.title ?? env;

/** A fall in progress (sensor flag or server countdown). */
export function hasFall(state: CrewState | null | undefined): boolean {
  if (!state) return false;
  return Boolean(state.vitals?.fall) || (state.fall_countdown_s ?? 0) > 0;
}

/** Overall crew status for the sidebar: worst of server band, lowest organ score, active fall/alarm. */
export function crewStatus(state: CrewState | null | undefined): { band: Band; score: number } {
  if (!state) return { band: 'green', score: 100 };
  const score = Math.round(Math.min(...Object.values(state.organ_scores_6)));
  const order: Band[] = ['green', 'amber', 'red'];
  let band: Band = scoreTone(score);
  if (order.indexOf(state.band) > order.indexOf(band)) band = state.band;
  if (hasFall(state) || state.alarm) band = 'red';
  return { band, score };
}
