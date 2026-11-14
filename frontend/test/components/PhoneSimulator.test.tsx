// @vitest-environment jsdom
/** Phone · Sensor Simulator page (opened from the console QR code). */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { badgeTone, PhoneSimulator } from '../../components/phone/PhoneSimulator';
import { aegisApi } from '../../lib/api/client';
import { mockFetch } from '../helpers';

const scenarios = {
  scenarios: {
    normal_walk: { id: 'normal_walk', name: 'Normal Surface Walk', badge: '🟢 NOMINAL', badge_color: '#10B981', description: 'flat', initial_state: { hr: 74 } },
    chest_pain: { id: 'chest_pain', name: 'Acute Chest Pain (Suspected Ischemia)', badge: '🔴 EMERGENCY', badge_color: '#EF4444', description: 'ST elevation', initial_state: { hr: 118, sys: 82, dia: 54 } },
    reset_all: { id: 'reset_all', name: 'Reset to Nominal Baseline', badge: '🟢', badge_color: '#10B981', description: 'reset', initial_state: { hr: 68 } },
  },
};

function setup(search = '') {
  window.history.replaceState({}, '', `/phone${search}`);
  const http = mockFetch({ '/api/scenarios': scenarios, '/api/sensors': { ok: true }, '/api/reset': { ok: true }, '/api/events': { ok: true } });
  render(<PhoneSimulator />);
  return http;
}

const sensorCalls = (calls: { url: string; body: any }[]) => calls.filter(c => c.url.endsWith('/api/sensors'));

describe('PhoneSimulator', () => {
  beforeEach(() => vi.stubGlobal('alert', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('lists the backend scenarios', async () => {
    setup();
    expect(await screen.findByText('Acute Chest Pain (Suspected Ischemia)')).toBeTruthy();
    expect(screen.getByText('Normal Surface Walk')).toBeTruthy();
  });

  it('tapping "Chest pain" starts the scenario on the server for the selected crew', async () => {
    const { calls } = setup();
    fireEvent.click(await screen.findByText('Acute Chest Pain (Suspected Ischemia)'));
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.scenario === 'chest_pain')).toBe(true));
    const call = sensorCalls(calls).find(c => c.body.scenario === 'chest_pain')!;
    expect(call.body.type).toBe('scenario');
    expect(String(call.body.crew)).toMatch(/A$/);
  });

  it('takes the crew from the QR link (?crew=C)', async () => {
    const { calls } = setup('?crew=C');
    fireEvent.click(await screen.findByText('Acute Chest Pain (Suspected Ischemia)'));
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.scenario === 'chest_pain')).toBe(true));
    expect(String(sensorCalls(calls).find(c => c.body.scenario === 'chest_pain')!.body.crew)).toMatch(/C$/);
  });

  it('an explicit slider change during a scenario is still sent (live override)', async () => {
    const { calls } = setup();
    fireEvent.click(await screen.findByText('Acute Chest Pain (Suspected Ischemia)'));
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.scenario === 'chest_pain')).toBe(true));
    fireEvent.change(screen.getByLabelText(/SYSTOLIC BLOOD PRESSURE/), { target: { value: '75' } });
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.sys === 75)).toBe(true));
  });

  it('scenario cards work from the keyboard', async () => {
    const { calls } = setup();
    const card = (await screen.findByText('Acute Chest Pain (Suspected Ischemia)')).closest('[role="button"]')!;
    fireEvent.keyDown(card, { key: 'Enter' });
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.scenario === 'chest_pain')).toBe(true));
  });

  it.each([['#EF4444', 'red'], ['#F59E0B', 'amber'], ['#10B981', 'green'], ['red', 'red'], [undefined, 'green']])(
    'scenario badge colour %s -> %s',
    (color, tone) => expect(badgeTone(color as string | undefined)).toBe(tone),
  );

  it('"Reset" restores the nominal baseline through POST /api/reset', async () => {
    const { calls } = setup();
    fireEvent.click(await screen.findByText('Reset to Nominal Baseline'));
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/reset'))).toBe(true));
  });

  it('"Trigger fall impact" sends fall=1 and cancelling sends an ack event', async () => {
    const { calls } = setup();
    await screen.findByText('Normal Surface Walk');
    fireEvent.click(screen.getByText('TRIGGER FALL IMPACT'));
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.fall === 1)).toBe(true));

    fireEvent.click(await screen.findByText('FALL ACTIVE (CANCEL)'));
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/events') && c.body.type === 'ack')).toBe(true));
  });

  it('moving a vital slider streams the new value', async () => {
    const { calls } = setup();
    await screen.findByText('Normal Surface Walk');
    fireEvent.change(screen.getByLabelText(/HEART RATE/), { target: { value: '150' } });
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.hr === 150)).toBe(true));
  });

  it('reports a failed scenario start when the Base Server is unreachable', async () => {
    setup();
    await screen.findByText('Normal Surface Walk');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    fireEvent.click(screen.getByText('Acute Chest Pain (Suspected Ischemia)'));
    expect(await screen.findByText(/FAILED TO TRIGGER SCENARIO/)).toBeTruthy();
  });

  /** sendSensors failing like an unreachable server (rejection pre-handled so Vitest does not abort). */
  const failSends = () =>
    vi.spyOn(aegisApi, 'sendSensors').mockImplementation(() => {
      const p = Promise.reject(new TypeError('Failed to fetch'));
      p.catch(() => {});
      return p;
    });

  it('the 1 Hz keepalive reports a lost uplink', async () => {
    setup();
    await screen.findByText('Normal Surface Walk');
    failSends();
    expect(await screen.findByText(/UPLINK DISCONNECTED/, undefined, { timeout: 2500 })).toBeTruthy();
  });

  // Regression: updateMetric() used to fire sendSensors() without a catch (unhandled rejection)
  // and claimed "TRANSMITTED TO CONSOLE" even when offline.
  it('a slider update does not claim success when the send fails', async () => {
    setup();
    await screen.findByText('Normal Surface Walk');
    failSends();
    fireEvent.change(screen.getByLabelText(/HEART RATE/), { target: { value: '150' } });
    expect(await screen.findByText(/UPLINK DISCONNECTED/)).toBeTruthy();
    expect(screen.queryByText(/TRANSMITTED TO CONSOLE/)).toBeNull();
  });

  // Regression: the 1 Hz keepalive kept sending slider values during playback; the backend
  // treats them as sticky overrides, which froze the 60-s scenario timeline.
  it('does not overwrite a running scenario with keepalive slider packets', async () => {
    const { calls } = setup();
    fireEvent.click(await screen.findByText('Acute Chest Pain (Suspected Ischemia)'));
    await waitFor(() => expect(sensorCalls(calls).some(c => c.body.scenario === 'chest_pain')).toBe(true));
    const start = calls.length;
    await new Promise(r => setTimeout(r, 1300));
    expect(sensorCalls(calls.slice(start)).filter(c => c.body.type === 'telemetry' && 'hr' in c.body)).toEqual([]);
  });
});
