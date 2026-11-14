'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { aegisApi, normalizeEnvId } from './api/client';
import type { ConsoleFrame, ConsoleMode, CrewId, CrewState, EnvId } from './api/types';

interface ConsoleContextValue {
  frame: ConsoleFrame | null;
  connection: 'connecting' | 'connected' | 'disconnected';
  crew: CrewId;
  setCrew: Dispatch<SetStateAction<CrewId>>;
  environment: EnvId;
  setEnvironment: (environment: EnvId) => void;
  mode: ConsoleMode;
  setMode: Dispatch<SetStateAction<ConsoleMode>>;
  currentCrew: CrewState | null;
  api: typeof aegisApi;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [frame, setFrame] = useState<ConsoleFrame | null>(null);
  const [connection, setConnection] = useState<ConsoleContextValue['connection']>('connecting');
  const [crew, setCrewState] = useState<CrewId>('A');
  const [mode, setMode] = useState<ConsoleMode>('body_map');
  const [environment, setEnvironmentState] = useState<EnvId>('crater_eva');
  const envInitialized = useRef(false);
  const handledAlarms = useRef(new Set<string>());

  useEffect(() => aegisApi.subscribeConsole(setFrame, connected => setConnection(connected ? 'connected' : 'disconnected')), []);

  useEffect(() => {
    if (!envInitialized.current && frame?.env) {
      envInitialized.current = true;
      setEnvironmentState(frame.env);
    }
  }, [frame?.env]);

  useEffect(() => {
    for (const event of frame?.events ?? []) {
      if (event.type !== 'alarm_jump_to_emergency') continue;
      const key = `${event.crew}-${event.ts}-${event.text}`;
      if (handledAlarms.current.has(key)) continue;
      handledAlarms.current.add(key);
      setCrewState(event.crew);
      setMode('mode2');
    }
  }, [frame]);

  const setCrew: Dispatch<SetStateAction<CrewId>> = useCallback((action: SetStateAction<CrewId>) => {
    setCrewState(prev => {
      const nextCrew = typeof action === 'function' ? action(prev) : action;
      const crewEnv = frame?.crews[nextCrew]?.vitals?.env;
      if (crewEnv) {
        setEnvironmentState(normalizeEnvId(crewEnv));
      }
      return nextCrew;
    });
  }, [frame]);

  const setEnvironment = useCallback((nextEnvironment: EnvId) => {
    setEnvironmentState(nextEnvironment);
    const currentVitals = frame?.crews[crew]?.vitals;
    void aegisApi.sendSensors({ ...(currentVitals ?? {}), crew, env: nextEnvironment }).catch(() => setConnection('disconnected'));
  }, [crew, frame]);

  const currentCrew = frame?.crews[crew] ?? null;
  const value = useMemo(() => ({ frame, connection, crew, setCrew, environment, setEnvironment, mode, setMode, currentCrew, api: aegisApi }), [frame, connection, crew, setCrew, environment, setEnvironment, mode, currentCrew]);

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error('useConsole must be used within ConsoleProvider');
  return context;
}
