import { useState, useEffect } from 'react';
import type { CrewId, SymptomId } from './api/types';

export interface CrewEmergencyState {
  emergencyStartTs: number | null;
  countdown: number;
  isLocked: boolean;
  lockType: 'fall' | 'hypoxia';
  fallCancelled: boolean;
  hypoxiaCancelled: boolean;
  simulatedFall: boolean;
  simulatedHypoxia: boolean;
  selectedSymptoms: SymptomId[];
}

const createDefault = (): CrewEmergencyState => ({
  emergencyStartTs: null,
  countdown: 30,
  isLocked: false,
  lockType: 'fall',
  fallCancelled: false,
  hypoxiaCancelled: false,
  simulatedFall: false,
  simulatedHypoxia: false,
  selectedSymptoms: [],
});

const store: Record<CrewId, CrewEmergencyState> = {
  A: createDefault(),
  B: createDefault(),
  C: createDefault(),
  D: createDefault(),
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(l => l());
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    let changed = false;
    const now = Date.now();
    for (const c of ['A', 'B', 'C', 'D'] as CrewId[]) {
      const state = store[c];
      if (state.emergencyStartTs !== null && !state.isLocked) {
        const elapsed = Math.floor((now - state.emergencyStartTs) / 1000);
        const remaining = Math.max(0, 30 - elapsed);
        if (remaining !== state.countdown) {
          state.countdown = remaining;
          changed = true;
        }
        if (remaining <= 0) {
          state.isLocked = true;
          state.countdown = 0;
          changed = true;
        }
      }
    }
    if (changed) notify();
  }, 500);
}

export const emergencyStore = {
  get(crew: CrewId): CrewEmergencyState {
    return store[crew];
  },
  update(crew: CrewId, patch: Partial<CrewEmergencyState>) {
    store[crew] = { ...store[crew], ...patch };
    notify();
  },
  startEmergency(crew: CrewId, type: 'fall' | 'hypoxia') {
    const current = store[crew];
    if (current.isLocked) return;
    if (current.emergencyStartTs === null) {
      store[crew] = {
        ...current,
        emergencyStartTs: Date.now(),
        countdown: 30,
        lockType: type,
        isLocked: false,
        fallCancelled: false,
        hypoxiaCancelled: false,
      };
      notify();
    }
  },
  lock(crew: CrewId, type: 'fall' | 'hypoxia') {
    store[crew] = {
      ...store[crew],
      isLocked: true,
      lockType: type,
      countdown: 0,
    };
    notify();
  },
  reset(crew: CrewId) {
    store[crew] = {
      ...createDefault(),
      fallCancelled: true,
      hypoxiaCancelled: true,
    };
    notify();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useEmergencyStore(crew: CrewId): CrewEmergencyState {
  const [, setTick] = useState(0);
  useEffect(() => {
    return emergencyStore.subscribe(() => setTick(t => t + 1));
  }, []);
  return emergencyStore.get(crew);
}
