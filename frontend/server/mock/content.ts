import type { ProtocolStep, ZoneId } from '../../lib/api/types';

export const zoneContent: Record<ZoneId, { title: string; function: string; space_measurements: string[]; nasa_threat: string; hazards: string[] }> = {
  cns: {
    title: 'Central Nervous System & Sleep',
    function: 'Maintains alertness, orientation, reaction time and sleep-wake regulation during mission operations.',
    space_measurements: ['PVT reaction time', 'Sleep duration / quality', 'Gait tremor', 'SANS symptom check'],
    nasa_threat: 'Fluid shifts and circadian disruption can affect vigilance and sensorimotor performance.',
    hazards: ['Microgravity fluid shift', 'Sleep debt', 'CO₂ exposure', 'Radiation dose', 'Isolation stress'],
  },
  cardio: {
    title: 'Cardiovascular & Hemodynamics',
    function: 'Tracks cardiac workload, blood pressure and perfusion during rest and EVA exertion.',
    space_measurements: ['Heart rate / HRV', 'Systolic and diastolic BP', 'ECG ST trend', 'Perfusion response'],
    nasa_threat: 'A sudden pressure or ECG change can reduce crew capability and requires clinical review.',
    hazards: ['Orthostatic intolerance', 'Deconditioning', 'EVA workload', 'Dehydration', 'Thermal stress'],
  },
  resp: {
    title: 'Respiratory & Gas Exchange',
    function: 'Monitors oxygenation, respiratory effort and suit-loop reserve for safe crew activity.',
    space_measurements: ['SpO₂', 'Respiratory rate', 'Suit CO₂ partial pressure', 'O₂ reserve / burn'],
    nasa_threat: 'Hypoxemia or elevated in-suit CO₂ can impair cognition and requires prompt protocol action.',
    hazards: ['Suit leak', 'Scrubber saturation', 'High workload', 'Dust exposure', 'Low O₂ reserve'],
  },
  thermo: {
    title: 'Immune, Thermal & Radiation',
    function: 'Observes core temperature, thermal balance and radiation exposure trends.',
    space_measurements: ['Core / skin temperature', 'Radiation dosimeter', 'LCVG flow', 'Inflammatory trend'],
    nasa_threat: 'Thermal extremes and cumulative radiation can affect performance and recovery.',
    hazards: ['Solar particle event', 'Thermal extremes', 'Cooling-loop fault', 'Regolith dust', 'Inflammation'],
  },
  metabolic: {
    title: 'Metabolic & Fluid Balance',
    function: 'Tracks glucose, hydration and energy balance that support sustained mission performance.',
    space_measurements: ['Blood glucose', 'Fluid intake / output', 'Electrolyte trend', 'Metabolic workload'],
    nasa_threat: 'Glucose or hydration excursions may increase fatigue and compromise EVA readiness.',
    hazards: ['Dehydration', 'Meal timing', 'Glucose excursion', 'High energy demand', 'Electrolyte loss'],
  },
  musculo: {
    title: 'Musculoskeletal & NIRS Fatigue',
    function: 'Estimates lower-limb fatigue and gait stability using muscle oxygenation and movement signals.',
    space_measurements: ['Calf SmO₂', 'NIRS desaturation slope', 'sEMG frequency shift', 'Gait asymmetry'],
    nasa_threat: 'Muscle fatigue may reduce mobility and increase fall risk during surface operations.',
    hazards: ['Steep slope', 'Cumulative EVA load', 'NIRS sensor fog', 'Suit joint resistance', 'Loose regolith'],
  },
};

export const routinePrompts = [
  { id: 'glucose-fluid', title: 'Glucose & fluid balance', due: '14:00 UTC', duration: '4 min', why: 'Regular glucose and hydration checks help identify early metabolic stress before it affects EVA readiness.' },
  { id: 'evening-wellness', title: 'Evening wellness survey', due: '18:30 UTC', duration: '5 min', why: 'A short sleep, energy, mood, pain and nutrition check supports recovery planning and next-sol readiness.' },
  { id: 'suit-thermal', title: 'Suit thermal loop check', due: '20:00 UTC', duration: '2 min', why: 'Checking cooling-loop flow after EVA helps identify thermal control issues before the next sortie.' },
];

export const quests = [
  { id: 'compression', title: 'Pneumatic compression', bonus: 15 },
  { id: 'hydration', title: 'Electrolyte hydration', bonus: 18 },
  { id: 'sleep-window', title: 'Protected sleep window', bonus: 20 },
] as const;

export const baseProtocolSteps: ProtocolStep[] = [
  { order: 1, title: 'Position for breathing', instruction: 'Support the crewmember upright at approximately 30 degrees and keep the airway clear.', diagram: 'position' },
  { order: 2, title: 'Prepare suit oxygen', instruction: 'Check the oxygen supply and keep the crewmember connected to the suit life-support loop.', diagram: 'oxygen' },
  { order: 3, title: 'Retrieve emergency kit', instruction: 'Ask a second crew member to retrieve the AED and medical kit from Bay B1 or B2.', diagram: 'bay' },
  { order: 4, title: 'Prepare AED', instruction: 'Expose the chest area as practical and place AED electrodes according to the device diagram.', diagram: 'aed' },
];

export const triageClasses = [
  'Acute Coronary Ischemia',
  'Hypoxemia / Respiratory Distress',
  'Fall / Musculoskeletal Injury',
  'Hypercapnia CO₂',
  'Decompression Barotrauma',
  'Nominal / Monitor',
];
