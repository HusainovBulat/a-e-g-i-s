import type { ProtocolStep, ZoneId } from '../../lib/api/types';

export const zoneContent: Record<ZoneId, {
  title: string;
  function: string;
  how_measured: string;
  space_measurements: string[];
  nasa_threat: string;
  space_hazard_danger: string;
  hazards: string[];
}> = {
  cns: {
    title: "BRAIN (Central Nervous System)",
    function: "Controls the body's movements, balance, coordination, sleep, mood, and responses to the environment.",
    how_measured: "A.E.G.I.S. tracks movement patterns and coordination using 3-axis IMU motion sensors, which help identify unusual gait patterns and neurological tremors, alongside daily sleep hours, mood (0..10), and optic nerve ultrasound.",
    space_measurements: ["3-axis IMU tremor & gait", "Sleep duration / quality", "Mood (0..10) & PVT latency", "Optic nerve ultrasound (SANS)"],
    nasa_threat: "Altered gravity disrupts the inner ear and nervous system, commonly triggering Space Adaptation Syndrome / Space Motion Sickness, neurovestibular dysfunction, and Spaceflight Associated Neuro-ocular Syndrome (SANS) (brain and optic nerve pressure).",
    space_hazard_danger: "Altered gravity disrupts the inner ear and nervous system, commonly triggering Space Adaptation Syndrome / Space Motion Sickness, neurovestibular dysfunction, and Spaceflight Associated Neuro-ocular Syndrome (SANS) (brain and optic nerve pressure). When affected, an astronaut experiences severe vertigo, nausea, disorientation, and spatial illusions where \"up\" and \"down\" feel confused. These symptoms impair hand-eye coordination and significantly increase the risk of stumbles or falls during lunar EVAs.",
    hazards: ["Neurovestibular disorientation", "Sleep debt & fatigue", "SANS optic nerve edema", "Impaired motor coordination", "Lunar crater fall risk"],
  },
  cardio: {
    title: "HEART & CIRCULATION (Cardiovascular System)",
    function: "Pumps blood throughout the body, delivering oxygen and nutrients to the brain, muscles, and other organs, and carries carbon dioxide and other waste products away from tissues.",
    how_measured: "A smart base-layer garment uses 3-lead ECG electrodes to monitor heart activity, while optical PPG sensors and cuffless blood-pressure monitoring track heart rate, pulse changes, and blood pressure (plus portable POCUS ultrasound).",
    space_measurements: ["3-lead Smart Base-Layer ECG", "Continuous BP (sys / dia)", "Optical PPG pulse rate & HRV", "POCUS cardiac ultrasound"],
    nasa_threat: "Microgravity shifts body fluids toward the upper body and changes how the heart works, leading to cardiac deconditioning / myocardial atrophy (heart muscle shrinkage), myocardial ischemia (reduced blood flow to the heart), and cardiac arrhythmias / atrial fibrillation (irregular heartbeats).",
    space_hazard_danger: "Microgravity shifts body fluids toward the upper body and changes how the heart works, leading to cardiac deconditioning / myocardial atrophy (heart muscle shrinkage), myocardial ischemia (reduced blood flow to the heart), and cardiac arrhythmias / atrial fibrillation (irregular heartbeats). Upward fluid shifts also trigger spaceflight anemia / hypovolemia (a 10% to 15% drop in blood volume and red blood cells) and increase the risk of jugular venous thrombosis (blood clots in upper-body veins). When an astronaut develops an arrhythmia or weakened heart muscle in space, disrupted electrical signals can cause chest fluttering, dizziness, and shortness of breath. Upon returning to gravity, blood rushes back to the legs, causing orthostatic intolerance / orthostatic syncope (sudden blood pressure drops, tunnel vision, and fainting).",
    hazards: ["Orthostatic intolerance / syncope", "Myocardial deconditioning", "Myocardial ischemia risk", "Spaceflight hypovolemia (-15%)", "Jugular thrombosis risk"],
  },
  resp: {
    title: "LUNGS (Respiratory System)",
    function: "Bring oxygen into the body and remove carbon dioxide through breathing.",
    how_measured: "Thoracic stretch sensors monitor breathing rate and patterns, while optical PPG sensors measure blood oxygen saturation (SpO\u2082). The spacesuit also provides CO\u2082 monitoring.",
    space_measurements: ["Thoracic stretch respiratory rate", "Optical PPG pulse oximetry (SpO\u2082)", "In-suit CO\u2082 partial pressure", "PLSS O\u2082 burn & reserve"],
    nasa_threat: "During strenuous lunar activities, astronauts can develop acute hypercapnia (carbon dioxide toxicity) if CO\u2082 builds up inside the helmet, alongside hypoxia / hypoxemia (low blood oxygen) or decompression sickness if oxygen or suit pressure drops.",
    space_hazard_danger: "During strenuous lunar activities, astronauts can develop acute hypercapnia (carbon dioxide toxicity) if CO\u2082 builds up inside the helmet, alongside hypoxia / hypoxemia (low blood oxygen) or decompression sickness if oxygen or suit pressure drops. When hypercapnia or hypoxia occurs, the astronaut quickly develops throbbing headaches, rapid breathing, confusion, and impaired judgment. Without immediate correction, these conditions can cause panic and sudden loss of consciousness during an EVA.",
    hazards: ["Acute hypercapnia (helmet CO\u2082)", "Hypoxemia / suit leak", "Decompression sickness", "Scrubber saturation", "High metabolic workload"],
  },
  thermo: {
    title: "IMMUNE & THERMOREGULATION (Immune System)",
    function: "Protects the body against infections, latent viral reactivation, and radiation-induced inflammation while regulating core body temperature.",
    how_measured: "Continuous core body temperature sensors (\u00b0C), onboard radiation dosimetry, and Smart Base-Layer resting heart rate and autonomic stress tracking.",
    space_measurements: ["Continuous core temperature (\u00b0C)", "Onboard radiation dosimeter", "LCVG water cooling loop", "Smart Base-Layer stress markers"],
    nasa_threat: "Deep-space radiation and chronic isolation trigger spaceflight immune dysregulation / T-cell suppression and latent herpesvirus reactivation alongside thermoregulatory dysfunction inside pressurized spacesuits.",
    space_hazard_danger: "Deep-space radiation and chronic isolation trigger spaceflight immune dysregulation / T-cell suppression and latent herpesvirus reactivation alongside thermoregulatory dysfunction inside pressurized spacesuits. When affected, astronauts experience low-grade fever, delayed wound healing, systemic fatigue, and rapid heat storage during strenuous lunar EVAs.",
    hazards: ["Solar particle events (radiation)", "Immune dysregulation (T-cell)", "Latent viral reactivation", "Spacesuit heat storage", "Regolith toxic dust"],
  },
  metabolic: {
    title: "NUTRITION & METABOLISM (Metabolic System & Blood Sugar)",
    function: "Supplies cells with glucose energy, water, and electrolytes to sustain cognitive alertness and physical stamina.",
    how_measured: "Onboard capillary glucometer measuring blood sugar levels in mg/dL, daily hydration and nutrition check-in sliders (0..10), and PLSS metabolic energy expenditure tracking (Watts).",
    space_measurements: ["Capillary blood sugar (mg/dL)", "PLSS metabolic rate (Watts)", "Hydration / electrolyte intake", "Daily nutrition check-in (0..10)"],
    nasa_threat: "Microgravity and high EVA workloads frequently cause spaceflight caloric deficit / anorexia, isotonic dehydration, and spaceflight-induced insulin resistance / glycemic variability (blood sugar swings outside 75\u2013115 mg/dL).",
    space_hazard_danger: "Microgravity and high EVA workloads frequently cause spaceflight caloric deficit / anorexia, isotonic dehydration, and spaceflight-induced insulin resistance / glycemic variability (blood sugar swings outside 75\u2013115 mg/dL). When blood sugar or hydration drops, astronauts experience dizziness, slowed vestibular reaction speed, accelerated muscle cramping, and heightened risk of fainting.",
    hazards: ["Isotonic dehydration", "Glycemic variability (<75 / >115)", "High caloric expenditure", "Electrolyte imbalance", "Orthostatic fainting risk"],
  },
  musculo: {
    title: "MUSCLES & BONES (Muscular & Skeletal System)",
    function: "Allow the body to move, maintain posture, support the body, protect internal organs, and perform physical activities such as walking and lifting.",
    how_measured: "NIRS sensors measure local muscle oxygenation (SmO\u2082), while surface EMG (sEMG) sensors track muscle activity and fatigue. Motion sensors (3-axis IMU) also detect changes in walking patterns and track changes in estimated axial bone loading over time through daily physiological monitoring and 14-day bone-load trend analysis (NASA OSDR OSD-783).",
    space_measurements: ["Calf NIRS SmO\u2082 oxygenation", "Surface EMG (sEMG) frequency shift", "3-axis IMU gait tremor & asymmetry", "14-day axial bone load (OSDR OSD-783)"],
    nasa_threat: "Reduced gravity decreases the normal workload on muscles, causing spaceflight muscle atrophy / sarcopenia (wasting of postural and leg muscles) and localized muscle ischemia (oxygen depletion) during heavy exertion.",
    space_hazard_danger: "Reduced gravity decreases the normal workload on muscles, causing spaceflight muscle atrophy / sarcopenia (wasting of postural and leg muscles) and localized muscle ischemia (oxygen depletion) during heavy exertion. Without Earth's gravity providing mechanical stress, astronauts also develop spaceflight-induced osteopenia / osteoporosis (accelerated bone density loss) and renal calculi / hypercalciuria (kidney stones) caused by excess calcium releasing into the bloodstream. As muscles weaken and lose oxygen, the astronaut suffers from painful cramps, tremors, and unstable walking patterns, while osteopenia leaves bones brittle and prone to fractures from minor falls.",
    hazards: ["Soleus / calf muscle atrophy", "Localized muscle ischemia", "Accelerated osteopenia / bone loss", "Hypercalciuria / kidney stones", "Crater slope fall & fracture"],
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
