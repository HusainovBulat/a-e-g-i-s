// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
