// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const vosk = vi.hoisted(() => ({ recognizer: null as any, createModel: null as any }));
vi.mock('vosk-browser', () => ({ createModel: (...args: unknown[]) => vosk.createModel(...args) }));

import { createSpeechRecognizer, matchSymptomsFromText, speakInstruction, stopSpeaking } from '../../lib/speech';

describe('matchSymptomsFromText (Hold to speak keyword matcher)', () => {
  it.each([
    ['He is clutching his chest, crushing pain', ['chest_pain']],
    ["She can't catch her breath", ['shortness_of_breath']],
    ['feels dizzy and lightheaded', ['dizziness']],
    ['he FELL and collapsed', ['fall']],
  ])('"%s" -> %j', (text, expected) => {
    expect(matchSymptomsFromText(text)).toEqual(expect.arrayContaining(expected));
  });

  it('recognises several symptoms in one sentence', () => {
    expect(matchSymptomsFromText('chest pain, short of breath and dizzy after a fall').sort())
      .toEqual(['chest_pain', 'dizziness', 'fall', 'shortness_of_breath']);
  });

  it('matches word stems ("breathing", "chests")', () => {
    expect(matchSymptomsFromText('Breathing is hard')).toEqual(['shortness_of_breath']);
  });

  it('returns nothing for a nominal report', () => {
    expect(matchSymptomsFromText('all good, nominal, continuing the traverse')).toEqual([]);
  });

  // Regression: substring matching used to hit "chair" -> "air" and "download" -> "down".
  it('does not match keywords inside unrelated words', () => {
    expect(matchSymptomsFromText('sitting in the chair, download complete')).toEqual([]);
  });
});

describe('speech synthesis', () => {
  afterEach(() => vi.unstubAllGlobals());

  function installSynth() {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', class { rate = 0; pitch = 0; lang = ''; constructor(public text: string) {} });
    return synth;
  }

  it('cancels the previous utterance and speaks the instruction in English', () => {
    const synth = installSynth();
    speakInstruction("Don't give nitroglycerin");
    expect(synth.cancel).toHaveBeenCalledOnce();
    const utterance = synth.speak.mock.calls[0][0];
    expect(utterance).toMatchObject({ text: "Don't give nitroglycerin", lang: 'en-US' });
  });

  it('stopSpeaking cancels speech', () => {
    const synth = installSynth();
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it('is a no-op on browsers without speechSynthesis', () => {
    expect(() => speakInstruction('hello')).not.toThrow();
  });
});

describe('createSpeechRecognizer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports unsupported browsers (offline text input fallback is used instead)', () => {
    expect(createSpeechRecognizer(() => {}).isSupported).toBe(false);
  });

  it('streams the transcript with matched symptoms', () => {
    let instance: any;
    vi.stubGlobal('webkitSpeechRecognition', class {
      start = vi.fn();
      stop = vi.fn();
      onresult: any;
      onend: any;
      constructor() { instance = this; }
    });
    const onTranscript = vi.fn();
    const onEnd = vi.fn();
    const rec = createSpeechRecognizer(onTranscript, onEnd);
    expect(rec.isSupported).toBe(true);
    expect(instance.lang).toBe('en-US');

    rec.start();
    expect(instance.start).toHaveBeenCalled();
    instance.onresult({ results: [[{ transcript: 'pain in the chest' }], [{ transcript: 'and dizzy' }]] });
    expect(onTranscript).toHaveBeenCalledWith('pain in the chest and dizzy', ['chest_pain', 'dizziness']);
    instance.onend();
    expect(onEnd).toHaveBeenCalled();
  });

  it('falls back to offline Vosk without SpeechRecognition (Firefox < 160)', async () => {
    localStorage.setItem('aegis.vosk.cached', '/vosk/vosk-model-small-en-us-0.15.tar.gz'); // model already in IndexedDB
    const handlers: Record<string, (m: any) => void> = {};
    const recognizer = {
      on: (event: string, fn: (m: any) => void) => { handlers[event] = fn; },
      acceptWaveform: vi.fn(),
      retrieveFinalResult: vi.fn(() => handlers.result({ result: { text: 'dizzy' } })),
      remove: vi.fn(),
    };
    vosk.createModel = vi.fn().mockResolvedValue({ KaldiRecognizer: vi.fn(() => recognizer) });
    const processor: any = { connect: vi.fn(), disconnect: vi.fn() };
    const audioCtx = { sampleRate: 48000, destination: {}, close: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createScriptProcessor: () => processor };
    vi.stubGlobal('AudioContext', vi.fn(() => audioCtx));
    const track = { stop: vi.fn() };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });

    const onTranscript = vi.fn();
    const onEnd = vi.fn();
    const onStatus = vi.fn();
    const rec = createSpeechRecognizer(onTranscript, onEnd, onStatus);
    expect(rec.isSupported).toBe(true);

    rec.start();
    await vi.waitFor(() => expect(processor.onaudioprocess).toBeTypeOf('function'));
    expect(vosk.createModel).toHaveBeenCalledWith('/vosk/vosk-model-small-en-us-0.15.tar.gz', -1);
    processor.onaudioprocess({ inputBuffer: 'chunk' });
    expect(recognizer.acceptWaveform).toHaveBeenCalledWith('chunk');

    handlers.partialresult({ result: { partial: 'chest [unk] pain' } });
    expect(onTranscript).toHaveBeenLastCalledWith('chest pain', ['chest_pain']);
    handlers.result({ result: { text: 'chest pain' } });

    rec.stop();
    expect(onTranscript).toHaveBeenLastCalledWith('chest pain dizzy', ['chest_pain', 'dizziness']);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalled();
    expect(recognizer.remove).toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalledWith(expect.stringMatching(/unavailable/));
  });
});
