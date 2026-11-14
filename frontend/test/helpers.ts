import { vi } from 'vitest';

import evening from './fixtures/backend/evening_masking.json';
import history from './fixtures/backend/history_crew_a.json';
import pairing from './fixtures/backend/pairing.json';
import summary from './fixtures/backend/summary_from_backend_evening.json';
import triage from './fixtures/backend/triage_chest_pain.json';
import alarm from './fixtures/backend/ws_alarm_chest_pain.json';
import wsEvent from './fixtures/backend/ws_event.json';
import fallCountdown from './fixtures/backend/ws_fall_countdown.json';
import hello from './fixtures/backend/ws_hello.json';
import stateSteepClimb from './fixtures/backend/ws_state_steep_climb.json';

/** Real Base Server responses captured by test/fixtures/capture-backend.mjs */
export const backend = { evening, history, pairing, summary, triage, alarm, wsEvent, fallCountdown, hello, stateSteepClimb };

export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Minimal browser WebSocket stand-in that lets a test push server messages. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.closed = true;
  }

  static latest() {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }

  static install() {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  }
}

/** fetch mock that records requests and answers by URL path. */
export function mockFetch(routes: Record<string, unknown | ((body: any) => unknown)>, status = 200) {
  const calls: { url: string; method: string; body: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    const path = new URL(url).pathname + new URL(url).search;
    const key = Object.keys(routes).find(k => path === k || path.startsWith(k));
    const value = key ? routes[key] : { detail: `no route for ${path}` };
    const payload = typeof value === 'function' ? (value as (b: any) => unknown)(body) : value;
    return new Response(JSON.stringify(payload), { status: key ? status : 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export const flushMicrotasks = () => new Promise<void>(resolve => setTimeout(resolve, 0));
