// @vitest-environment jsdom
/** WS /ws/console → ConsoleFrame mapping, fed with real Base Server messages. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aegisApi } from '../../lib/api/client';
import type { ConsoleFrame } from '../../lib/api/types';
import { backend, clone, FakeWebSocket, flushMicrotasks } from '../helpers';

function subscribe() {
  const frames: ConsoleFrame[] = [];
  const status: boolean[] = [];
  const unsubscribe = aegisApi.subscribeConsole(f => frames.push(f), s => status.push(s));
  const ws = FakeWebSocket.latest();
  return { frames, status, unsubscribe, ws, last: () => frames[frames.length - 1] };
}

describe('subscribeConsole', () => {
  beforeEach(() => FakeWebSocket.install());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects to ws://<host>:8000/ws/console and reports the link status', () => {
    const { ws, status, unsubscribe } = subscribe();
    expect(ws.url).toBe(`ws://${window.location.hostname}:8000/ws/console`);
    ws.open();
    expect(status).toEqual([true]);
    unsubscribe();
  });

  it('hello: routes every backend crew id to its own card', async () => {
    const { ws, last, unsubscribe } = subscribe();
    ws.receive(backend.hello);
    await flushMicrotasks();
    for (const letter of ['A', 'B', 'C', 'D'] as const) {
      const raw = (backend.hello.data.crews as any)[`Crew_${letter}`];
      expect(last().crews[letter].organ_scores_6.cns).toBe(raw.organ_scores.cns_brain.score);
    }
    unsubscribe();
  });

  it('hello: builds all 4 crew states from the backend snapshot', async () => {
    const { ws, last, unsubscribe } = subscribe();
    ws.receive(backend.hello);
    await flushMicrotasks();

    const frame = last();
    expect(Object.keys(frame.crews).sort()).toEqual(['A', 'B', 'C', 'D']);
    const raw = backend.hello.data.crews.Crew_B;
    const b = frame.crews.B;
    expect(b.crew).toBe('B');
    expect(b.vitals.hr).toBe(raw.vitals.hr);
    expect(b.vitals.env).toBe('moon_base');
    expect(b.organ_scores_6.cardio).toBe(raw.organ_scores.cardiovascular.score);
    expect(b.organ_scores_6.musculo).toBe(raw.organ_scores.musculoskeletal.score);
    unsubscribe();
  });

/** The live-EVA fixture re-addressed to another crew member. */
  const steepClimbOnB = () => {
    const msg = clone(backend.stateSteepClimb);
    msg.crew = 'Crew_B';
    msg.data.crew = 'Crew_B';
    return msg;
  };

  // Regression (critical for the demo): normalizeCrewId() used includes('C') on "CREW_A",
  // so every Crew_A / Crew_D message from the backend was written into crew C.
  it.each(['Crew_A', 'Crew_D'])('routes %s backend messages to the right crew card', async crewId => {
    const { ws, last, unsubscribe } = subscribe();
    const msg = clone(backend.stateSteepClimb);
    msg.crew = crewId;
    msg.data.crew = crewId;
    ws.receive(msg);
    await flushMicrotasks();
    const letter = crewId.slice(-1) as 'A' | 'D';
    expect(last().crews[letter].vitals.slope).toBe(msg.data.vitals.slope);
    expect(last().crews.C.vitals.slope).not.toBe(msg.data.vitals.slope);
    unsubscribe();
  });

  it('state: maps Model A, Model B and the walk-back limit of a live EVA', async () => {
    const { ws, last, unsubscribe } = subscribe();
    ws.receive(steepClimbOnB());
    await flushMicrotasks();

    const raw = backend.stateSteepClimb.data;
    const a = last().crews.B;
    expect(a.vitals.env).toBe('crater_eva');
    expect(a.vitals.slope).toBe(raw.vitals.slope);
    expect(a.vitals.fall).toBe(false);
    expect(a.vitals.nirs_ok).toBe(true);
    expect(a.model_a.fatigue_score).toBe(raw.model_a.fatigue_score);
    expect(a.model_a.fallback).toBe(false);
    expect(a.model_b.metabolic_w).toBe(raw.model_b.metabolic_rate_watts);
    expect(a.model_b.o2_burn_l_min).toBe(raw.model_b.o2_burn_rate_l_min);
    expect(a.model_b.o2_left_pct).toBe(raw.model_b.o2_left_pct);
    expect(a.model_b.walk_back_min).toBe(raw.walk_back.minutes);
    expect(a.band).toBe(raw.composite_band);
    unsubscribe();
  });

  it('marks Model A as fallback when the NIRS sensor is fogged', async () => {
    const { ws, last, unsubscribe } = subscribe();
    const msg = steepClimbOnB();
    msg.data.vitals.nirs_ok = 0;
    msg.data.model_a.nirs_fogged = true;
    ws.receive(msg);
    await flushMicrotasks();
    expect(last().crews.B.vitals.nirs_ok).toBe(false);
    expect(last().crews.B.model_a.fallback).toBe(true);
    unsubscribe();
  });

  // Regression: legs_fail_in_min = null (stable fatigue) used to become "legs fail in 45 min".
  it('keeps "legs fail in" empty when the backend reports a stable fatigue trend', async () => {
    const { ws, last, unsubscribe } = subscribe();
    const msg = steepClimbOnB();
    msg.data.model_a.legs_fail_in_min = null;
    ws.receive(msg);
    await flushMicrotasks();
    expect(last().crews.B.model_a.legs_fail_min).toBeNull();
    unsubscribe();
  });

  it('alarm_jump_to_emergency: updates the crew and emits the jump event', async () => {
    const { ws, last, unsubscribe } = subscribe();
    ws.receive(backend.alarm);
    await flushMicrotasks();

    const frame = last();
    const b = frame.crews.B;
    expect(b.vitals.sys).toBeLessThan(90);
    expect(b.alarm?.reasons).toEqual(expect.arrayContaining(['st_elevation', 'hypotension']));
    expect(frame.events[0]).toMatchObject({ type: 'alarm_jump_to_emergency', crew: 'B' });
    expect(frame.events[0].text).toContain('st_elevation');
    unsubscribe();
  });

  it('fall_countdown: arms the 30 s countdown and jumps to the emergency tab', async () => {
    const { ws, last, unsubscribe } = subscribe();
    ws.receive(backend.fallCountdown);
    await flushMicrotasks();
    const c = last().crews.C;
    expect(c.fall_countdown_s).toBe(backend.fallCountdown.data.seconds);
    expect(c.vitals.fall).toBe(true);
    expect(last().events[0]).toMatchObject({ type: 'alarm_jump_to_emergency', crew: 'C' });
    unsubscribe();
  });

  it('event: prepends timeline entries and keeps at most 50', async () => {
    const { ws, last, unsubscribe } = subscribe();
    for (let i = 0; i < 60; i++) {
      const msg = clone(backend.wsEvent);
      msg.data.text = `event ${i}`;
      ws.receive(msg);
    }
    await flushMicrotasks();
    expect(last().events).toHaveLength(50);
    expect(last().events[0].text).toBe('event 59');
    unsubscribe();
  });

  it('batches a burst of messages into one frame per microtask', async () => {
    const { ws, frames, unsubscribe } = subscribe();
    ws.receive(backend.hello);
    ws.receive(backend.stateSteepClimb);
    ws.receive(backend.wsEvent);
    await flushMicrotasks();
    expect(frames).toHaveLength(1);
    unsubscribe();
  });

  it('ignores malformed messages', async () => {
    const { ws, frames, unsubscribe } = subscribe();
    ws.onmessage?.({ data: 'not json' });
    await flushMicrotasks();
    expect(frames).toHaveLength(0);
    unsubscribe();
  });

  it('reconnects 1.5 s after the socket closes', () => {
    vi.useFakeTimers();
    const { ws, status, unsubscribe } = subscribe();
    ws.onclose?.();
    expect(status).toEqual([false]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    unsubscribe();
  });

  it('unsubscribe closes the socket and stops reconnecting', () => {
    vi.useFakeTimers();
    const { ws, frames, unsubscribe } = subscribe();
    unsubscribe();
    expect(ws.closed).toBe(true);
    ws.onclose?.();
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(frames).toHaveLength(0);
  });
});
