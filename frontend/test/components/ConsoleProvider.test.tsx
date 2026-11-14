// @vitest-environment jsdom
/** Key live-demo moment: a phone emergency makes the big screen jump to the Mode 2 tab. */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleProvider, useConsole } from '../../lib/ConsoleProvider';
import { backend, clone, FakeWebSocket, flushMicrotasks, mockFetch } from '../helpers';

function Probe() {
  const { mode, crew, connection, currentCrew, environment } = useConsole();
  return (
    <dl>
      <dd data-testid="mode">{mode}</dd>
      <dd data-testid="crew">{crew}</dd>
      <dd data-testid="connection">{connection}</dd>
      <dd data-testid="env">{environment}</dd>
      <dd data-testid="hr">{currentCrew?.vitals.hr ?? '-'}</dd>
    </dl>
  );
}

async function push(message: unknown) {
  await act(async () => {
    FakeWebSocket.latest().receive(message);
    await flushMicrotasks();
  });
}

describe('ConsoleProvider', () => {
  beforeEach(() => FakeWebSocket.install());
  afterEach(() => vi.unstubAllGlobals());

  it('starts on the body map and shows the connection status', async () => {
    render(<ConsoleProvider><Probe /></ConsoleProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('body_map');
    expect(screen.getByTestId('connection').textContent).toBe('connecting');
    await act(async () => FakeWebSocket.latest().open());
    expect(screen.getByTestId('connection').textContent).toBe('connected');
  });

  it('jumps to Mode 2 on the crew that raised alarm_jump_to_emergency', async () => {
    render(<ConsoleProvider><Probe /></ConsoleProvider>);
    await push(backend.hello);
    expect(screen.getByTestId('crew').textContent).toBe('A');

    await push(backend.alarm); // chest pain on Crew_B
    expect(screen.getByTestId('mode').textContent).toBe('mode2');
    expect(screen.getByTestId('crew').textContent).toBe('B');
    expect(screen.getByTestId('hr').textContent).toBe(String(backend.alarm.data.state.vitals.hr));
  });

  it('jumps to Mode 2 when a fall countdown starts', async () => {
    render(<ConsoleProvider><Probe /></ConsoleProvider>);
    await push(backend.fallCountdown); // Crew_C
    expect(screen.getByTestId('mode').textContent).toBe('mode2');
    expect(screen.getByTestId('crew').textContent).toBe('C');
  });

  it('does not jump again for an alarm it has already handled', async () => {
    let ctx: ReturnType<typeof useConsole> | null = null;
    function Grab() {
      ctx = useConsole();
      return null;
    }
    render(<ConsoleProvider><Probe /><Grab /></ConsoleProvider>);
    await push(backend.alarm);
    act(() => ctx!.setMode('mode1'));
    await push(clone(backend.stateSteepClimb)); // new frame still contains the old alarm event
    expect(screen.getByTestId('mode').textContent).toBe('mode1');
  });

  it('switching the environment sends it to the backend for the current crew', async () => {
    const { calls } = mockFetch({ '/api/sensors': { ok: true } });
    let ctx: ReturnType<typeof useConsole> | null = null;
    function Grab() {
      ctx = useConsole();
      return null;
    }
    render(<ConsoleProvider><Probe /><Grab /></ConsoleProvider>);
    await push(backend.hello);
    await act(async () => ctx!.setEnvironment('mars_transit'));
    expect(screen.getByTestId('env').textContent).toBe('mars_transit');
    expect(calls[0].body).toMatchObject({ env: 'spacecraft_mars_transit', type: 'telemetry' });
  });

  it('useConsole outside the provider throws a helpful error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useConsole must be used within ConsoleProvider');
  });
});
