import type { ZoneId } from '../../lib/api/types';

export interface BodyZone {
  id: ZoneId;
  code: string;
  shortTitle: string;
  position: [number, number, number];
  labelPosition: [number, number, number];
  fallbackPosition: [number, number];
  volumeScale: [number, number, number];
  parts: [number, number, number][];
  pulse: 'heart' | 'lungs' | 'none';
}

export const suitHeight = 2.75;
export const suitRotationY = Math.PI;
export const suitOffset: [number, number, number] = [0.03, 0, -0.15];
export const homeCamera: [number, number, number] = [3.4, 1.65, 5.2];

export const bodyZones: BodyZone[] = [
  { id: 'cns', code: '01', shortTitle: 'CNS / BRAIN', position: [0.01, 1.17, -0.07], labelPosition: [-1.05, 1.3, 0.1], fallbackPosition: [180, 77], volumeScale: [0.12, 0.11, 0.13], parts: [[0, 0, 0]], pulse: 'none' },
  { id: 'cardio', code: '02', shortTitle: 'CARDIO', position: [0.06, 0.64, 0.07], labelPosition: [1.05, 0.92, 0.1], fallbackPosition: [166, 145], volumeScale: [0.07, 0.085, 0.06], parts: [[0, 0, 0]], pulse: 'heart' },
  { id: 'resp', code: '03', shortTitle: 'RESPIRATORY', position: [-0.13, 0.7, 0.03], labelPosition: [-1.05, 0.72, 0.1], fallbackPosition: [194, 147], volumeScale: [0.09, 0.16, 0.08], parts: [[0, 0, 0], [0.26, 0, 0]], pulse: 'lungs' },
  { id: 'thermo', code: '04', shortTitle: 'IMMUNE / THERMO', position: [0.02, 0.38, 0.04], labelPosition: [1.05, 0.38, 0.1], fallbackPosition: [180, 198], volumeScale: [0.17, 0.075, 0.1], parts: [[0, 0, 0]], pulse: 'none' },
  { id: 'metabolic', code: '05', shortTitle: 'METABOLIC', position: [-0.02, 0.12, 0.05], labelPosition: [-1.05, 0.1, 0.1], fallbackPosition: [180, 235], volumeScale: [0.15, 0.1, 0.1], parts: [[0, 0, 0]], pulse: 'none' },
  { id: 'musculo', code: '06', shortTitle: 'MUSCULOSKELETAL', position: [0.13, -0.85, 0.1], labelPosition: [1.05, -0.85, 0.1], fallbackPosition: [180, 316], volumeScale: [0.085, 0.3, 0.085], parts: [[0, 0, 0], [-0.34, 0, 0]], pulse: 'none' },
];

export const zoneTitles: Record<ZoneId, string> = {
  cns: 'CNS / BRAIN',
  cardio: 'CARDIOVASCULAR',
  resp: 'RESPIRATORY',
  thermo: 'IMMUNE / THERMO',
  metabolic: 'METABOLIC',
  musculo: 'MUSCULOSKELETAL',
};

export function scoreColor(score: number) {
  if (score >= 80) return '#2ecc71';
  if (score >= 60) return '#f5b301';
  return '#fc3d21';
}

export const zonePlainSubtitles: Record<ZoneId, string> = {
  cns: 'Sleep, balance, reaction speed & eye pressure',
  cardio: 'Heart rhythm, blood pressure & blood flow to brain',
  resp: 'Blood oxygen (SpO2), breathing rate & helmet CO2',
  thermo: 'Body temperature (36.3–37.2°C) & radiation stress',
  metabolic: 'Blood sugar energy (mg/dL) & hydration balance',
  musculo: 'Leg muscle stamina (SmO2) & 14-day bone load',
};
