import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEEPALIVE_MS, isRemoteApi, keepAliveIntervalMs, startKeepAlive } from '../../lib/keepAlive';

function fakeDoc() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
    fire() {
      listeners.forEach(fn => fn());
    },
    listeners,
  };
}

describe('keepAliveIntervalMs', () => {
  it('defaults to 4 minutes, "0" disables, clamps tiny values', () => {
    expect(keepAliveIntervalMs(undefined)).toBe(DEFAULT_KEEPALIVE_MS);
    expect(keepAliveIntervalMs('')).toBe(DEFAULT_KEEPALIVE_MS);
    expect(keepAliveIntervalMs('0')).toBe(0);
    expect(keepAliveIntervalMs('abc')).toBe(0);
    expect(keepAliveIntervalMs('1000')).toBe(30_000);
    expect(keepAliveIntervalMs('600000')).toBe(600_000);
  });
});

describe('isRemoteApi', () => {
  it.each([
    ['https://aegis-backend.onrender.com', true],
    ['https://api.example.com/', true],
    ['http://localhost:8000', false],
    ['http://127.0.0.1:8000', false],
    ['http://192.168.1.20:8000', false],
    ['https://10.0.0.5', false],
    ['http://172.20.1.1:8000', false],
    ['http://laptop.local:8000', false],
    ['not a url', false],
  ])('%s -> %s', (base, expected) => {
    expect(isRemoteApi(base)).toBe(expected);
  });
});

describe('startKeepAlive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pings /health immediately, on every interval and when the tab becomes visible', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'));
    const doc = fakeDoc();
    const stop = startKeepAlive({ apiBase: 'https://aegis.onrender.com/', intervalMs: 60_000, fetchImpl, doc });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://aegis.onrender.com/health', { cache: 'no-store' });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    stop();
    expect(doc.listeners.size).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not stack requests while a cold start is still pending', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const stop = startKeepAlive({ apiBase: 'https://aegis.onrender.com', intervalMs: 30_000, fetchImpl, doc: fakeDoc() });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    stop();
  });

  it('survives network errors and keeps pinging', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const stop = startKeepAlive({ apiBase: 'https://aegis.onrender.com', intervalMs: 30_000, fetchImpl, doc: fakeDoc() });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop();
  });

  it('is a no-op for local stacks and when disabled', () => {
    const fetchImpl = vi.fn();
    startKeepAlive({ apiBase: 'http://192.168.0.10:8000', intervalMs: 30_000, fetchImpl, doc: fakeDoc() })();
    startKeepAlive({ apiBase: 'https://aegis.onrender.com', intervalMs: 0, fetchImpl, doc: fakeDoc() })();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
