// @vitest-environment jsdom
/** Mode 2 · Emergency triage: nitroglycerin hard-block, triage call, Flight Surgeons badge. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Mode2Screen } from '../../components/mode2/Mode2Screen';
import { ConsoleProvider } from '../../lib/ConsoleProvider';
import { backend, clone, FakeWebSocket, flushMicrotasks, mockFetch } from '../helpers';

const NITRO = /DO NOT ADMINISTER NITROGLYCERIN/i;

async function renderWith(message: unknown) {
  const http = mockFetch({ '/api/triage': backend.triage, '/api/sensors': { ok: true }, '/api/events': { ok: true } });
  render(<ConsoleProvider><Mode2Screen /></ConsoleProvider>);
  await act(async () => {
    FakeWebSocket.latest().receive(message);
    await flushMicrotasks();
  });
  return http;
}

describe('Mode2Screen', () => {
  beforeEach(() => FakeWebSocket.install());
  afterEach(() => vi.unstubAllGlobals());

  it('shows the nitroglycerin hard-block banner for systolic BP < 90 (chest-pain alarm)', async () => {
    await renderWith(backend.alarm);
    expect(await screen.findByText(NITRO)).toBeTruthy();
  });

  it('runs triage against the backend for the alarmed crew', async () => {
    const { calls } = await renderWith(backend.alarm);
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/triage'))).toBe(true));
    await waitFor(() => expect(calls.filter(c => c.url.endsWith('/api/triage')).at(-1)!.body.crew).toBe('Crew_B'));
    const body = calls.filter(c => c.url.endsWith('/api/triage')).at(-1)!.body;
    expect(body.crew).toBe('Crew_B');
    expect(body.vitals.sys).toBeLessThan(90);
    await waitFor(() => expect(screen.getByText(/FLIGHT SURGEONS ALERT QUEUED/)).toBeTruthy());
  });

  it('no nitroglycerin banner for a nominal crew', async () => {
    const nominal = clone(backend.triage);
    nominal.primary_class = 'Nominal';
    nominal.dont_give_list = [];
    nominal.flight_surgeons_queued = false;
    mockFetch({ '/api/triage': nominal, '/api/sensors': { ok: true } });
    render(<ConsoleProvider><Mode2Screen /></ConsoleProvider>);
    await act(async () => {
      FakeWebSocket.latest().receive(backend.hello);
      await flushMicrotasks();
    });
    await waitFor(() => expect(screen.getByText(/FLIGHT SURGEONS: STANDBY|TRIAGE READY/)).toBeTruthy());
    expect(screen.queryByText(NITRO)).toBeNull();
  });

  it('tapping the chest-pain card pushes the chest-pain vitals to the backend', async () => {
    const { calls } = await renderWith(backend.hello);
    const before = calls.length;
    const card = screen.getAllByRole('button').find(b => /chest/i.test(b.textContent ?? '') && !/scenario/i.test(b.textContent ?? ''));
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    await waitFor(() => expect(calls.slice(before).some(c => c.url.endsWith('/api/sensors') && c.body.sys === 82)).toBe(true));
  });
});
