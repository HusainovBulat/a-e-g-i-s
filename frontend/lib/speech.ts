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

export function matchSymptomsFromText(text: string): SymptomId[] {
  const lower = text.toLowerCase();
  const matched: SymptomId[] = [];
  for (const [symptom, words] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (words.some(word => lower.includes(word))) {
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
