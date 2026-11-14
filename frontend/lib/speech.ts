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

export function createSpeechRecognizer(
  onTranscript: (transcript: string, matched: SymptomId[]) => void,
  onEnd?: () => void
): { start: () => void; stop: () => void; isSupported: boolean } {
  if (typeof window === 'undefined') {
    return { start: () => {}, stop: () => {}, isSupported: false };
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return { start: () => {}, stop: () => {}, isSupported: false };
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
