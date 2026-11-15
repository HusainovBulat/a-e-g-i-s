'use client';

import type { SymptomId } from './api/types';

const SYMPTOM_KEYWORDS: Record<SymptomId, string[]> = {
  chest_pain: ['chest', 'pain', 'tight', 'tightness', 'crushing', 'heart', 'arm', 'jaw', 'pressure'],
  shortness_of_breath: ['breath', 'breathing', 'air', 'dyspnea', 'choking', 'oxygen', 'lungs'],
  dizziness: ['dizzy', 'dizziness', 'lightheaded', 'faint', 'syncope', 'spinning'],
  fall: ['fall', 'fell', 'collapse', 'collapsed', 'unconscious', 'down', 'floor'],
  nausea: ['nausea', 'sick', 'vomit', 'vomiting', 'stomach'],
  headache: ['headache', 'head', 'migraine', 'vision', 'sans'],
};

/**
 * Whole-word matching: a keyword matches a spoken word exactly, or as a stem when it has
 * 5+ letters ("breath" -> "breathing"). Avoids substring hits like "chair" -> "air".
 */
function keywordMatches(tokens: string[], keyword: string): boolean {
  return tokens.some(token => token === keyword || (keyword.length >= 5 && token.startsWith(keyword)));
}

export function matchSymptomsFromText(text: string): SymptomId[] {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const matched: SymptomId[] = [];
  for (const [symptom, words] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (words.some(word => keywordMatches(tokens, word))) {
      matched.push(symptom as SymptomId);
    }
  }
  return matched;
}

export function speakInstruction(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis errors on unsupported browsers
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/** True when voice input will run on the offline Vosk model (no native SpeechRecognition). */
export function usesOfflineVoiceModel(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  if (w.SpeechRecognition || w.webkitSpeechRecognition) return false;
  return Boolean((w.AudioContext || w.webkitAudioContext) && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
}

export function createSpeechRecognizer(
  onTranscript: (transcript: string, matched: SymptomId[]) => void,
  onEnd?: () => void,
  onStatus?: (status: string) => void
): { start: () => void; stop: () => void; isSupported: boolean } {
  if (typeof window === 'undefined') {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Chrome/Edge/Safari and Firefox 160+ use the native API above; older Firefox -> offline Vosk.
    return createVoskRecognizer(onTranscript, onEnd, onStatus);
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript + ' ';
      }
      const trimmed = fullTranscript.trim();
      const matched = matchSymptomsFromText(trimmed);
      onTranscript(trimmed, matched);
    };

    recognition.onend = () => {
      onEnd?.();
    };

    return {
      start: () => {
        try {
          recognition.start();
        } catch {
          // already started
        }
      },
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // already stopped
        }
      },
      isSupported: true,
    };
  } catch {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }
}

/** Vosk model served by the console itself (frontend/public/vosk): no internet needed. */
export const VOSK_MODEL_URL = '/vosk/vosk-model-small-en-us-0.15.tar.gz';

/**
 * Restricting Vosk to the symptom vocabulary makes it robust for this task: everything else
 * comes back as "[unk]" and is dropped from the transcript.
 */
const VOSK_GRAMMAR = JSON.stringify([
  ...Array.from(new Set([...Object.values(SYMPTOM_KEYWORDS).flat(), 'breathe', 'breathing', 'fainted', 'hurts', 'short of breath'])),
  '[unk]',
]);

export type VoskLoadState = { status: 'idle' | 'loading' | 'ready' | 'error'; progress: number };

const VOSK_CACHED_KEY = 'aegis.vosk.cached';
let voskModel: Promise<any> | null = null;
let voskState: VoskLoadState = { status: 'idle', progress: 0 };
const voskListeners = new Set<(s: VoskLoadState) => void>();

function setVoskState(next: VoskLoadState) {
  voskState = next;
  voskListeners.forEach(fn => fn(next));
}

/** Subscribe to the offline model loading progress (0..1). Returns the unsubscribe function. */
export function subscribeVoskModel(fn: (s: VoskLoadState) => void): () => void {
  voskListeners.add(fn);
  fn(voskState);
  return () => { voskListeners.delete(fn); };
}

function readCachedFlag(): boolean {
  try { return localStorage.getItem(VOSK_CACHED_KEY) === VOSK_MODEL_URL; } catch { return false; }
}

function writeCachedFlag() {
  try { localStorage.setItem(VOSK_CACHED_KEY, VOSK_MODEL_URL); } catch { /* private mode */ }
}

/**
 * Downloads the archive with byte progress (0..85%). This also warms the HTTP cache, so the
 * Vosk worker's own fetch of the same URL is served locally.
 */
async function prefetchWithProgress(onProgress: (p: number) => void): Promise<void> {
  const response = await fetch(VOSK_MODEL_URL);
  if (!response.ok) throw new Error(`model ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) { await response.arrayBuffer(); return; }
  const reader = response.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    onProgress(Math.min(received / total, 1));
  }
}

/**
 * Starts loading the offline model in the background (idempotent). Vosk stores the unpacked
 * model in IndexedDB, so after the first visit only the fast initialisation step remains.
 */
export function preloadVoskModel(): Promise<any> {
  if (voskModel) return voskModel;
  setVoskState({ status: 'loading', progress: 0 });
  const cached = readCachedFlag();
  const initFrom = cached ? 0 : 0.85;

  voskModel = (async () => {
    if (!cached) await prefetchWithProgress(p => setVoskState({ status: 'loading', progress: p * initFrom }));
    // Unpacking + WASM start-up report no progress: ease towards 99% until the model is ready.
    let progress = initFrom;
    const timer = setInterval(() => {
      progress += (0.99 - progress) * 0.08;
      setVoskState({ status: 'loading', progress });
    }, 150);
    try {
      const { createModel } = await import('vosk-browser');
      const model = await createModel(VOSK_MODEL_URL, -1);
      writeCachedFlag();
      setVoskState({ status: 'ready', progress: 1 });
      return model;
    } finally {
      clearInterval(timer);
    }
  })();
  voskModel.catch(() => {
    voskModel = null; // allow a retry on the next tap
    setVoskState({ status: 'error', progress: 0 });
  });
  return voskModel;
}

const loadVoskModel = preloadVoskModel;

/**
 * Offline fallback for browsers without SpeechRecognition (Firefox < 160): Vosk (Kaldi, WASM)
 * runs in a web worker and streams partial results while the rescuer is speaking.
 */
function createVoskRecognizer(
  onTranscript: (transcript: string, matched: SymptomId[]) => void,
  onEnd?: () => void,
  onStatus?: (status: string) => void
): { start: () => void; stop: () => void; isSupported: boolean } {
  const AudioCtx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx || typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  let session: { stop: () => void } | null = null;
  let starting = false;
  let stopRequested = false;

  const start = async () => {
    if (session || starting) return;
    starting = true;
    stopRequested = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      onStatus?.('');
      const [model, mic] = await Promise.all([
        loadVoskModel(),
        navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }),
      ]);
      stream = mic;
      if (stopRequested) throw new Error('cancelled');

      const audio = new AudioCtx();
      ctx = audio;
      const recognizer = new model.KaldiRecognizer(audio.sampleRate, VOSK_GRAMMAR);
      const source = audio.createMediaStreamSource(mic);
      const processor = audio.createScriptProcessor(4096, 1, 1);
      const finals: string[] = [];
      let stopping = false;
      let done = false;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;

      const emit = (partial: string) => {
        const text = [...finals, partial].join(' ').replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim();
        onTranscript(text, matchSymptomsFromText(text));
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(finishTimer);
        processor.onaudioprocess = null;
        try { source.disconnect(); processor.disconnect(); } catch { /* already disconnected */ }
        mic.getTracks().forEach(t => t.stop());
        void audio.close().catch(() => {});
        try { recognizer.remove(); } catch { /* worker gone */ }
        session = null;
        onEnd?.();
      };

      recognizer.on('partialresult', (m: any) => emit(m.result?.partial ?? ''));
      recognizer.on('result', (m: any) => {
        if (m.result?.text) finals.push(m.result.text);
        emit('');
        if (stopping) finish();
      });
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        try { recognizer.acceptWaveform(e.inputBuffer); } catch { /* recognizer not ready */ }
      };
      source.connect(processor);
      processor.connect(audio.destination);

      session = {
        stop: () => {
          if (stopping) return;
          stopping = true;
          processor.onaudioprocess = null;
          try { recognizer.retrieveFinalResult(); } catch { /* ignore */ }
          finishTimer = setTimeout(finish, 1500); // final result normally arrives within ~100 ms
        },
      };
      if (stopRequested) session.stop();
    } catch (err) {
      stream?.getTracks().forEach(t => t.stop());
      void ctx?.close().catch(() => {});
      const cancelled = err instanceof Error && err.message === 'cancelled';
      onStatus?.(cancelled ? '' : 'Voice input unavailable (microphone blocked or offline model failed to load)');
      onEnd?.();
    } finally {
      starting = false;
    }
  };

  return {
    start: () => { void start(); },
    stop: () => {
      stopRequested = true;
      session?.stop();
    },
    isSupported: true,
  };
}
