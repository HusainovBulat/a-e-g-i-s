// @vitest-environment jsdom
/** Offline voice model (Firefox < 160): background preload with progress for the "Initialization" bar. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createModel = vi.fn();
vi.mock('vosk-browser', () => ({ createModel: (...args: unknown[]) => createModel(...args) }));

function streamResponse(chunks: number[], total: number) {
  let i = 0;
  return {
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(total) : null) },
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: new Uint8Array(chunks[i++]) } : { done: true }) }) },
  };
}

async function freshSpeech() {
  vi.resetModules();
  return import('../../lib/speech');
}

describe('preloadVoskModel', () => {
  beforeEach(() => { localStorage.clear(); createModel.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  it('reports download progress, then ready, and remembers the cached model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([25, 25, 50], 100));
    vi.stubGlobal('fetch', fetchMock);
    createModel.mockResolvedValue({ id: 'model' });
    const speech = await freshSpeech();

    const states: { status: string; progress: number }[] = [];
    speech.subscribeVoskModel(s => states.push(s));
    const model = await speech.preloadVoskModel();

    expect(model).toEqual({ id: 'model' });
    expect(fetchMock).toHaveBeenCalledWith('/vosk/vosk-model-small-en-us-0.15.tar.gz');
    expect(createModel).toHaveBeenCalledWith('/vosk/vosk-model-small-en-us-0.15.tar.gz', -1);
    const loading = states.filter(s => s.status === 'loading').map(s => s.progress);
    expect(loading).toEqual([...loading].sort((a, b) => a - b)); // monotonic
    expect(loading).toContain(0.85 * 0.5);
    expect(states.at(-1)).toEqual({ status: 'ready', progress: 1 });
    expect(localStorage.getItem('aegis.vosk.cached')).toBe('/vosk/vosk-model-small-en-us-0.15.tar.gz');

    // Idempotent: a second call (e.g. from the Emergency tab) reuses the same load.
    await speech.preloadVoskModel();
    expect(createModel).toHaveBeenCalledOnce();
  });

  it('skips the byte download when Vosk already holds the model in IndexedDB', async () => {
    localStorage.setItem('aegis.vosk.cached', '/vosk/vosk-model-small-en-us-0.15.tar.gz');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    createModel.mockResolvedValue({});
    const speech = await freshSpeech();
    await speech.preloadVoskModel();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an error and allows a retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const speech = await freshSpeech();
    const states: string[] = [];
    speech.subscribeVoskModel(s => states.push(s.status));
    await expect(speech.preloadVoskModel()).rejects.toThrow();
    await Promise.resolve();
    expect(states.at(-1)).toBe('error');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([10], 10)));
    createModel.mockResolvedValue({});
    await expect(speech.preloadVoskModel()).resolves.toEqual({});
  });

  it('only uses the offline model when native SpeechRecognition is missing', async () => {
    const speech = await freshSpeech();
    vi.stubGlobal('AudioContext', class {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
    expect(speech.usesOfflineVoiceModel()).toBe(true);
    vi.stubGlobal('SpeechRecognition', class {});
    expect(speech.usesOfflineVoiceModel()).toBe(false);
  });
});
