// @vitest-environment jsdom
/** Phone gyroscope: tilt-as-slope and shake/drop fall detection (Master Plan §6.3). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestMotionPermission, subscribeMotion, type MotionData } from '../../lib/motion';

function orientation(beta: number, gamma = 0) {
  const event = new Event('deviceorientation') as any;
  event.beta = beta;
  event.gamma = gamma;
  window.dispatchEvent(event);
}

function motion(x: number, y: number, z: number) {
  const event = new Event('devicemotion') as any;
  event.accelerationIncludingGravity = { x, y, z };
  window.dispatchEvent(event);
}

describe('subscribeMotion', () => {
  let updates: MotionData[];
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    updates = [];
    unsubscribe = subscribeMotion(d => updates.push(d));
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it.each([
    [0, 0],
    [22.5, 11],
    [45, 22],
    [90, 22],
    [-45, 22],
  ])('tilt beta=%s° -> crater slope %s°', (beta, slope) => {
    orientation(beta);
    expect(updates.at(-1)!.slopeAngle).toBe(slope);
  });

  it('reports a shake / drop as a fall', () => {
    motion(0, 9.8, 0);
    vi.advanceTimersByTime(150);
    motion(30, -30, 30);
    expect(updates.at(-1)!.shakeDetected).toBe(true);
  });

  it('does not report a fall for a phone held still', () => {
    motion(0, 9.8, 0);
    vi.advanceTimersByTime(150);
    motion(0.1, 9.7, 0.05);
    expect(updates.at(-1)!.shakeDetected).toBe(false);
  });

  it('carries the latest tilt slope in motion updates', () => {
    orientation(45);
    vi.advanceTimersByTime(150);
    motion(0, 9.8, 0);
    expect(updates.at(-1)!.slopeAngle).toBe(22);
  });

  it('stops listening after unsubscribe', () => {
    unsubscribe();
    orientation(30);
    expect(updates).toHaveLength(0);
  });
});

describe('requestMotionPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('needs no prompt on Android / desktop', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    await expect(requestMotionPermission()).resolves.toBe(true);
  });

  it.each([['granted', true], ['denied', false]] as const)('iOS answer "%s" -> %s', async (answer, expected) => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue(answer) });
    await expect(requestMotionPermission()).resolves.toBe(expected);
  });

  it('treats a rejected iOS prompt (e.g. not over HTTPS) as denied', async () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    await expect(requestMotionPermission()).resolves.toBe(false);
  });
});

describe('subscribeMotion before the gyroscope reports', () => {
  it('does not invent a slope from accelerometer-only updates', () => {
    const updates: MotionData[] = [];
    const unsubscribe = subscribeMotion(d => updates.push(d));
    const event = new Event('devicemotion') as any;
    event.accelerationIncludingGravity = { x: 0, y: 9.8, z: 0 };
    window.dispatchEvent(event);
    unsubscribe();
    expect(updates).toHaveLength(1);
    expect(updates[0].slopeAngle).toBeUndefined();
  });
});

describe('requestMotionPermission on iOS asks for orientation too', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('denied orientation -> no tilt -> false', async () => {
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: vi.fn().mockResolvedValue('denied') });
    await expect(requestMotionPermission()).resolves.toBe(false);
  });

  it('requests both prompts in the same tap', async () => {
    const m = vi.fn().mockResolvedValue('granted');
    const o = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceMotionEvent', { requestPermission: m });
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: o });
    await expect(requestMotionPermission()).resolves.toBe(true);
    expect(m).toHaveBeenCalledOnce();
    expect(o).toHaveBeenCalledOnce();
  });
});
