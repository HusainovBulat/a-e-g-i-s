import type { ZoneId } from '../../../lib/api/types';

export interface BodyZone {
  id: ZoneId;
  title: string;
  /** Anchor on the figure (viewBox 480 × 520) for the label leader line. */
  anchor: [number, number];
  side: 'left' | 'right';
  /** Label row y on its side. */
  labelY: number;
}

export const bodyZones: BodyZone[] = [
  { id: 'cns', title: 'Brain & sleep', anchor: [222, 54], side: 'left', labelY: 54 },
  { id: 'resp', title: 'Lungs', anchor: [204, 160], side: 'left', labelY: 150 },
  { id: 'metabolic', title: 'Metabolism', anchor: [210, 258], side: 'left', labelY: 262 },
  { id: 'cardio', title: 'Heart & vessels', anchor: [260, 176], side: 'right', labelY: 150 },
  { id: 'thermo', title: 'Immune & thermo', anchor: [276, 222], side: 'right', labelY: 222 },
  { id: 'musculo', title: 'Muscles & bones', anchor: [281, 360], side: 'right', labelY: 360 },
];

export const zoneTitles: Record<ZoneId, string> = Object.fromEntries(bodyZones.map(z => [z.id, z.title])) as Record<ZoneId, string>;
