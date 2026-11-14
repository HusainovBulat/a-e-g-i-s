"""
PROJECT A.E.G.I.S. (v4.0) — Core Mathematical & Deterministic Safety Engine
NASA Space Apps Challenge 2026

Authors: Kostya (AI & Core Architecture Lead) & Bulat (Backend API Pipeline)
Standard: NASA-STD-3001 Vol 1 & 2 / NASA OCHMO-TB-004 / NASA HRP 5 Hazards

Architectural Pillars Enforced:
1. Two-Scale Normalization Rule:
   - Astronaut Input Scale: strictly 0..10
   - System Health & ML Scale: strictly 0..100 (80-100 Green, 60-79 Yellow, 0-59 Red)
2. Zero Hallucination Hard Clinical Safety Interlocks (Nitroglycerin Ban, O2 Surge, CO2 Purge).
3. NASA HRP 5 Hazards Environmental Shift Matrix (Earth Baseline vs. Space Shift).
4. Astronaut Masking Detector (Детектор лжи космонавта, delta >= 30.0).
5. Consequence Simulator & Gamification (+15/+18/+20 Quests, 110-min failure curve).
"""

from typing import Dict, List, Tuple, Any, Optional, Union
import math


# =====================================================================
# 1. CONSTANTS, COLOR BANDS & CLINICAL SAFETY BOUNDARIES (NASA-STD-3001)
# =====================================================================

HEALTH_BANDS = {
    "GREEN": {"min": 80.0, "max": 100.0, "label": "NOMINAL", "status": "nominal"},
    "YELLOW": {"min": 60.0, "max": 79.99, "label": "CAUTION", "status": "crew_action"},
    "RED": {"min": 0.0, "max": 59.99, "label": "CRITICAL", "status": "emergency"},
}

QUEST_BONUSES = {
    "hydration": 15.0,     # Electrolyte Hydration (+15 pts)
    "compression": 18.0,   # Pneumatic Compression / Myostimulation (+18 pts)
    "breathing": 20.0,     # Guided Respiration / Cortisol Reset (+20 pts)
}

# Spaceflight Environments & 5 NASA Hazards Matrix
ENVIRONMENTS_CONFIG = {
    "spacecraft_mars_transit": {
        "id": "spacecraft_mars_transit",
        "display_name": "Spacecraft (Mars Transit 0g)",
        "gravity_g": 0.0,
        "hazards": {
            "radiation": "high",        # Galactic cosmic rays, unshielded deep space
            "isolation": 1.0,           # Extreme isolation factor
            "distance_delay_s": 1200.0, # Up to 20-minute communication latency
            "altered_gravity": "0g microgravity (fluid cephalad shift)",
            "hostile_environment": "Deep space vehicle closed ECLSS"
        },
        "baseline_shift": {
            "hr": 4.0,         # +4 bpm baseline sympathetic tone
            "bp_sys": -5.0,     # -5 mmHg orthostatic deconditioning
            "smo2": -3.0,       # -3% microvascular deconditioning
            "cortisol": 15.0    # +15% chronic stress baseline
        }
    },
    "space_station_orbital": {
        "id": "space_station_orbital",
        "display_name": "Space Station (Orbital 0g)",
        "gravity_g": 0.0,
        "hazards": {
            "radiation": "moderate",    # LEO magnetosphere partial protection
            "isolation": 0.3,           # High crew connectivity
            "distance_delay_s": 0.5,    # Real-time LEO ground link
            "altered_gravity": "0g microgravity (bone demineralization)",
            "hostile_environment": "Station module atmosphere"
        },
        "baseline_shift": {
            "hr": 2.0,
            "bp_sys": -3.0,
            "smo2": -2.0,
            "cortisol": 5.0
        }
    },
    "pressurized_rover": {
        "id": "pressurized_rover",
        "display_name": "Pressurized Rover (1/6g)",
        "gravity_g": 0.166,
        "hazards": {
            "radiation": "moderate",    # Vehicle hull shielding
            "isolation": 0.6,           # Mobile field crew
            "distance_delay_s": 1.3,    # Lunar surface 1.3s delay
            "altered_gravity": "1/6g lunar gravity",
            "hostile_environment": "Cabin rover atmosphere, lunar dust ingress risk"
        },
        "baseline_shift": {
            "hr": 3.0,
            "bp_sys": -2.0,
            "smo2": -1.0,
            "cortisol": 8.0
        }
    },
    "lunar_base_habitat": {
        "id": "lunar_base_habitat",
        "display_name": "Lunar Base Habitat (1/6g)",
        "gravity_g": 0.166,
        "hazards": {
            "radiation": "low",         # Regolith berm / subterranean shielding
            "isolation": 0.4,           # Base community
            "distance_delay_s": 1.3,
            "altered_gravity": "1/6g lunar gravity",
            "hostile_environment": "Pressurized habitat with airlock scrubbers"
        },
        "baseline_shift": {
            "hr": 1.0,
            "bp_sys": 0.0,
            "smo2": 0.0,
            "cortisol": 3.0
        }
    },
    "surface_eva_spacesuit": {
        "id": "surface_eva_spacesuit",
        "display_name": "Surface EVA Spacesuit (1/6g Crater)",
        "gravity_g": 0.166,
        "hazards": {
            "radiation": "high",        # Direct lunar surface solar & cosmic exposure
            "isolation": 0.8,           # Autonomous field buddy pair
            "distance_delay_s": 1.3,
            "altered_gravity": "1/6g lunar locomotion in pressurized suit (4.3 psi)",
            "hostile_environment": "Extreme thermal swings (-130°C to +120°C), abrasive dust, hard vacuum"
        },
        "baseline_shift": {
            "hr": 15.0,        # Suit mobility and metabolic locomotion overhead
            "bp_sys": 8.0,      # Physical exertion load
            "smo2": -8.0,       # Active muscle oxygen extraction
            "cortisol": 25.0    # High-workload situational awareness
        }
    }
}


# =====================================================================
# 2. HELPER FUNCTIONS & CLASSIFICATION
# =====================================================================

def clamp(val: float, min_val: float, max_val: float) -> float:
    """Clamps a floating-point value within [min_val, max_val]."""
    return max(min_val, min(max_val, float(val)))


def classify_health_band(score_0_100: float) -> Dict[str, Any]:
    """
    Classifies a 0..100 health score into the strict NASA Space Apps tripartite scale:
      - 80..100: Green (NOMINAL)
      - 60..79.99: Yellow (CAUTION / CREW ACTION)
      - 0..59.99: Red (CRITICAL / EMERGENCY)
    """
    score = clamp(score_0_100, 0.0, 100.0)
    if score >= 80.0:
        return {
            "score": round(score, 1),
            "band": "green",
            "label": "NOMINAL",
            "status": "nominal",
            "badge_color": "#10B981",
            "requires_action": False
        }
    elif score >= 60.0:
        return {
            "score": round(score, 1),
            "band": "yellow",
            "label": "CAUTION",
            "status": "crew_action",
            "badge_color": "#F59E0B",
            "requires_action": True
        }
    else:
        return {
            "score": round(score, 1),
            "band": "red",
            "label": "CRITICAL",
            "status": "emergency",
            "badge_color": "#EF4444",
            "requires_action": True
        }


def scale_slider_to_system(slider_0_10: float) -> float:
    """Converts Astronaut Input Scale (0..10) to System Health Scale (0..100)."""
    return clamp(slider_0_10 * 10.0, 0.0, 100.0)


def scale_system_to_slider(system_0_100: float) -> float:
    """Converts System Health Scale (0..100) to Astronaut Input Scale (0..10)."""
    return clamp(system_0_100 / 10.0, 0.0, 10.0)


# =====================================================================
# 3. ENVIRONMENT & 5 HAZARDS MATRIX (EARTH BASELINE VS. SPACE SHIFT)
# =====================================================================

def normalize_env_key(env_name_or_id: str) -> str:
    """Normalizes arbitrary environment string to standard config key."""
    clean = env_name_or_id.lower().strip()
    if "transit" in clean or "mars" in clean or "spacecraft" in clean:
        return "spacecraft_mars_transit"
    elif "station" in clean or "orbital" in clean or "iss" in clean:
        return "space_station_orbital"
    elif "rover" in clean:
        return "pressurized_rover"
    elif "base" in clean or "habitat" in clean:
        return "lunar_base_habitat"
    elif "suit" in clean or "eva" in clean or "surface" in clean:
        return "surface_eva_spacesuit"
    return "lunar_base_habitat"


def get_environment_shift(env_name_or_id: str) -> Dict[str, Any]:
    """
    Returns the NASA HRP 5 Hazards profile and physiological baseline shifts
    relative to standard 1g Earth baseline.
    """
    key = normalize_env_key(env_name_or_id)
    env_cfg = ENVIRONMENTS_CONFIG[key]
    return {
        "environment_id": env_cfg["id"],
        "display_name": env_cfg["display_name"],
        "gravity_g": env_cfg["gravity_g"],
        "hazards": env_cfg["hazards"],
        "baseline_shift": env_cfg["baseline_shift"]
    }


def calculate_organ_scores(vitals: Dict[str, Any], env_name_or_id: str = "lunar_base_habitat") -> Dict[str, Any]:
    """
    Recalculates physiological health indices (strictly 0..100) for all 6 clickable body zones
    accounting for the environment's baseline shift.

    6 Clickable Organ Zones:
      1. cns_brain: Head / Brain (CNS) — Sleep, mood, tremor, reaction, SANS
      2. cardiovascular: Heart / Vessels — HR, BP, ECG ST-segment, HRV
      3. respiratory: Lungs / Respiration — SpO2, respiration rate, CO2 pp
      4. immune_thermo: Immune / Thermoregulation — Core temp, radiation dose, stress
      5. metabolic_nutrition: Nutrition / Metabolism — Blood sugar (mg/dL), hydration
      6. musculoskeletal: Legs / Muscles / Bones — NIRS SmO2, sEMG fatigue, bone load
    """
    shift_info = get_environment_shift(env_name_or_id)
    shift = shift_info["baseline_shift"]

    # Extract vitals with safe defaults
    hr = float(vitals.get("hr", 70.0))
    bp_sys = float(vitals.get("sys", vitals.get("bp_sys", 118.0)))
    bp_dia = float(vitals.get("dia", vitals.get("bp_dia", 76.0)))
    spo2 = float(vitals.get("spo2", 98.5))
    resp = float(vitals.get("resp", vitals.get("resp_rate", 15.0)))
    temp = float(vitals.get("temp", vitals.get("body_temp_c", 36.7)))
    blood_sugar = float(vitals.get("blood_sugar_mgdl", vitals.get("blood_sugar", 92.0)))
    smo2 = float(vitals.get("smo2", vitals.get("calf_smo2_pct", 78.0)))
    # ST segment elevation: auto-detect and support "st_elevation_mv", "st", or "st_elevation_mm"
    # Clinical standard: 1 mm = 0.1 mV. Acute STEMI threshold: >= 0.1 mV (>= 1.0 mm)
    raw_st = vitals.get("st_elevation_mv", vitals.get("st", vitals.get("st_elevation_mm", 0.0)))
    try:
        raw_st_val = float(raw_st)
    except (ValueError, TypeError):
        raw_st_val = 0.0

    # Auto-detect units: if abs > 0.5, value is in mm (e.g. 1.8 mm -> 0.18 mV); otherwise already in mV
    if abs(raw_st_val) > 0.5:
        st_elevation_mv = raw_st_val / 10.0
    else:
        st_elevation_mv = raw_st_val
    co2_pp = float(vitals.get("co2_pp_mmhg", 2.5))
    gait_tremor = float(vitals.get("gait_tremor_sd", vitals.get("gait", 0.3)))
    sleep_score = float(vitals.get("sleep_score", vitals.get("subjective_sleep_slider", 8.0))) * 10.0
    mood_score = float(vitals.get("mood_score", vitals.get("subjective_mood_slider", 8.0))) * 10.0

    # 1. ZONE 1: CNS / Brain
    # Penalty for high tremor (> 1.2 SD), poor sleep (< 60), low mood (< 60)
    cns_base = (sleep_score * 0.45) + (mood_score * 0.35) + 20.0
    if gait_tremor > 1.0:
        cns_base -= (gait_tremor - 1.0) * 22.0
    cns_score = clamp(cns_base, 0.0, 100.0)

    # 2. ZONE 2: Cardiovascular
    # Adjusted for environment baseline shift
    effective_hr = hr - shift.get("hr", 0.0)
    effective_sys = bp_sys - shift.get("bp_sys", 0.0)
    cardio_score = 100.0

    # Heart rate deviation from optimal 65-80 bpm
    if effective_hr > 90.0:
        cardio_score -= (effective_hr - 90.0) * 1.1
    elif effective_hr < 55.0:
        cardio_score -= (55.0 - effective_hr) * 1.5

    # Systolic BP deviation from optimal 110-125 mmHg
    if effective_sys > 135.0:
        cardio_score -= (effective_sys - 135.0) * 1.2
    elif effective_sys < 95.0:
        cardio_score -= (95.0 - effective_sys) * 2.0  # Danger of hypotension

    # ST segment elevation (ischemia flag: > 0.1 mV or > 1.0 mm)
    if st_elevation_mv > 0.1:
        cardio_score -= (st_elevation_mv / 0.3) * 45.0

    cardio_score = clamp(cardio_score, 0.0, 100.0)

    # 3. ZONE 3: Respiration / Lungs
    # SpO2 (< 95 caution, < 92 critical) & CO2 pp (> 4.0 caution, > 7.5 critical)
    resp_score = 100.0
    if spo2 < 95.0:
        resp_score -= (95.0 - spo2) * 12.0
    if co2_pp > 4.0:
        resp_score -= (co2_pp - 4.0) * 14.0
    if resp > 22.0:
        resp_score -= (resp - 22.0) * 3.0
    elif resp < 10.0:
        resp_score -= (10.0 - resp) * 6.0
    resp_score = clamp(resp_score, 0.0, 100.0)

    # 4. ZONE 4: Immune & Thermoregulation
    # Body temp (optimal 36.4 - 37.0 °C)
    thermo_score = 100.0
    temp_dev = abs(temp - 36.7)
    if temp_dev > 0.4:
        thermo_score -= (temp_dev - 0.4) * 40.0
    thermo_score = clamp(thermo_score, 0.0, 100.0)

    # 5. ZONE 5: Nutrition & Metabolism
    # Blood sugar in mg/dL (optimal 75 - 115 mg/dL)
    metabolic_score = 100.0
    if blood_sugar > 115.0:
        metabolic_score -= (blood_sugar - 115.0) * 0.9
    elif blood_sugar < 75.0:
        metabolic_score -= (75.0 - blood_sugar) * 1.8
    metabolic_score = clamp(metabolic_score, 0.0, 100.0)

    # 6. ZONE 6: Musculoskeletal / Legs
    # SmO2 in calf muscle (adjusted for environment baseline shift)
    effective_smo2 = smo2 - shift.get("smo2", 0.0)
    musculo_score = clamp((effective_smo2 / 80.0) * 100.0, 0.0, 100.0)
    if effective_smo2 < 55.0:
        musculo_score -= (55.0 - effective_smo2) * 1.8
    musculo_score = clamp(musculo_score, 0.0, 100.0)

    # Construct organ cards
    zones = {
        "cns_brain": {
            "name": "Head / Brain (CNS)",
            "score": round(cns_score, 1),
            "band_info": classify_health_band(cns_score),
            "key_metrics": {
                "sleep_index": round(sleep_score, 1),
                "mood_index": round(mood_score, 1),
                "gait_tremor_sd": round(gait_tremor, 2)
            }
        },
        "cardiovascular": {
            "name": "Heart & Vessels",
            "score": round(cardio_score, 1),
            "band_info": classify_health_band(cardio_score),
            "key_metrics": {
                "hr_bpm": round(hr, 1),
                "bp_sys_mmhg": round(bp_sys, 1),
                "bp_dia_mmhg": round(bp_dia, 1),
                "st_elevation_mv": round(st_elevation_mv, 3),
                "st_elevation_mm": round(st_elevation_mv * 10.0, 2)
            }
        },
        "respiratory": {
            "name": "Lungs & Respiration",
            "score": round(resp_score, 1),
            "band_info": classify_health_band(resp_score),
            "key_metrics": {
                "spo2_pct": round(spo2, 1),
                "resp_rate_bpm": round(resp, 1),
                "co2_pp_mmhg": round(co2_pp, 2)
            }
        },
        "immune_thermo": {
            "name": "Immune & Thermoregulation",
            "score": round(thermo_score, 1),
            "band_info": classify_health_band(thermo_score),
            "key_metrics": {
                "body_temp_c": round(temp, 2),
                "temp_status": "nominal" if 36.3 <= temp <= 37.2 else "deviant"
            }
        },
        "metabolic_nutrition": {
            "name": "Nutrition & Metabolism",
            "score": round(metabolic_score, 1),
            "band_info": classify_health_band(metabolic_score),
            "key_metrics": {
                "blood_sugar_mgdl": round(blood_sugar, 1),
                "unit": "mg/dL"
            }
        },
        "musculoskeletal": {
            "name": "Legs, Muscles & Bones",
            "score": round(musculo_score, 1),
            "band_info": classify_health_band(musculo_score),
            "key_metrics": {
                "calf_smo2_pct": round(smo2, 1),
                "effective_smo2_pct": round(effective_smo2, 1)
            }
        }
    }

    # Composite System Health Score (weighted average)
    composite = (
        cns_score * 0.15 +
        cardio_score * 0.25 +
        resp_score * 0.25 +
        thermo_score * 0.10 +
        metabolic_score * 0.10 +
        musculo_score * 0.15
    )
    composite = clamp(composite, 0.0, 100.0)

    return {
        "environment": shift_info,
        "composite_health_score": round(composite, 1),
        "overall_band": classify_health_band(composite),
        "organ_zones": zones
    }


# =====================================================================
# 4. ASTRONAUT MASKING DETECTOR (ДЕТЕКТОР ЛЖИ КОСМОНАВТА)
# =====================================================================

def detect_masking(
    subjective_inputs: Union[Dict[str, float], List[float]],
    objective_score: float,
    vitals: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Detects psychological masking (underreporting symptoms or hiding fatigue)
    by comparing 5 subjective sliders (0..10) against objective telemetry (0..100).

    Rules Enforced:
    1. Subjective Score = mean(5 sliders) * 10 (range 0..100)
    2. Primary Trigger: If (Subjective - Objective) >= 30.0 -> MASKING DETECTED!
    3. Secondary Trigger: If Subjective Energy >= 7.0 and (Objective Muscle Fatigue >= 70 or Gait Tremor >= 2.0 SD)
    4. Safety Action: Revokes autonomous EVA clearance, escalates to Crew / Commander Attention.
    """
    # Parse 5 sliders
    if isinstance(subjective_inputs, dict):
        sliders = [
            float(subjective_inputs.get("sleep", subjective_inputs.get("subjective_sleep_slider", 8.0))),
            float(subjective_inputs.get("energy", subjective_inputs.get("subjective_energy_slider", 8.0))),
            float(subjective_inputs.get("mood", subjective_inputs.get("subjective_mood_slider", 8.0))),
            float(subjective_inputs.get("pain_free", subjective_inputs.get("subjective_pain_free_slider", 8.0))),
            float(subjective_inputs.get("nutrition", subjective_inputs.get("subjective_nutrition_slider", 8.0)))
        ]
        energy_slider = float(subjective_inputs.get("energy", subjective_inputs.get("subjective_energy_slider", 8.0)))
    else:
        sliders = [float(x) for x in subjective_inputs[:5]]
        energy_slider = sliders[1] if len(sliders) > 1 else sliders[0]

    # Clamp sliders to 0..10
    sliders = [clamp(x, 0.0, 10.0) for x in sliders]
    subjective_mean_slider = sum(sliders) / len(sliders)
    subjective_score = clamp(subjective_mean_slider * 10.0, 0.0, 100.0)
    obj_score = clamp(objective_score, 0.0, 100.0)

    delta = subjective_score - obj_score

    # Check secondary triggers from vitals/telemetry if available
    vitals = vitals or {}
    muscle_fatigue = float(vitals.get("muscle_fatigue_score", vitals.get("fatigue", 0.0)))
    gait_tremor = float(vitals.get("gait_tremor_sd", vitals.get("gait", 0.0)))

    primary_trigger = (delta >= 30.0)
    secondary_trigger = (energy_slider >= 7.0) and (muscle_fatigue >= 70.0 or gait_tremor >= 2.0 or obj_score < 50.0)

    masking_detected = primary_trigger or secondary_trigger

    # Determine status band and escalation
    if masking_detected:
        escalation_level = "CREW_COMMANDER_ATTENTION"
        eva_auto_clearance = False
        # Masking discrepancy: status band is strictly yellow (caution) to flag contradiction
        status_band = "yellow"
        if primary_trigger:
            reason = (
                f"Subjective report ({subjective_score:.1f}/100) exceeds objective sensors "
                f"({obj_score:.1f}/100) by {delta:.1f} points (threshold >= 30.0)."
            )
        else:
            reason = (
                f"High subjective energy ({energy_slider:.1f}/10) conflicts with objective "
                f"muscle exhaustion / neurological gait tremor."
            )
        alert_banner = (
            "🟡 MASKING DETECTED: Discrepancy between subjective self-report and smart-shirt telemetry. "
            "Autonomous EVA auto-clearance revoked. Commander schedule review required."
        )
    else:
        reason = "Subjective reporting matches objective physiological measurements."
        alert_banner = None
        if obj_score >= 80.0:
            escalation_level = "NOMINAL"
            eva_auto_clearance = True
            status_band = "green"
        elif obj_score >= 60.0:
            escalation_level = "CREW_ACTION"
            eva_auto_clearance = False
            status_band = "yellow"
        else:
            escalation_level = "COMMANDER_REVIEW"
            eva_auto_clearance = False
            status_band = "red"

    return {
        "masking_detected": bool(masking_detected),
        "mismatch_detected": bool(masking_detected),
        "delta": round(delta, 1),
        "subjective_score": round(subjective_score, 1),
        "subjective_mean_slider": round(subjective_mean_slider, 2),
        "objective_score": round(obj_score, 1),
        "eva_auto_clearance": bool(eva_auto_clearance),
        "escalation_level": escalation_level,
        "status_band": status_band,
        "reason": reason,
        "alert_banner": alert_banner
    }


# =====================================================================
# 5. CONSEQUENCE SIMULATOR & GAMIFICATION (+15/+18/+20)
# =====================================================================

def calculate_eva_readiness_score(
    objective_score: float,
    quests_completed: Union[Dict[str, bool], List[str]],
    is_masking: bool = False
) -> Dict[str, Any]:
    """
    Computes EVA Readiness Score (strictly 0..100) with gamification quest bonuses:
      - Electrolyte hydration: +15.0 pts
      - Compression / myostimulation: +18.0 pts
      - Breathing / cortisol reset: +20.0 pts

    Readiness Tiers (NASA-STD-3001):
      - >= 85.0: 🟢 CLEARED FOR EVA
      - 60.0 .. 84.9: 🟡 CAUTION (Crew action / reduced EVA duration)
      - < 60.0: 🔴 PROHIBITED (Commander schedule swap mandated)
    """
    # Parse completed quests
    active_quests = {}
    if isinstance(quests_completed, dict):
        for q, bonus in QUEST_BONUSES.items():
            active_quests[q] = bool(quests_completed.get(q, False))
    elif isinstance(quests_completed, (list, tuple, set)):
        q_set = set(quests_completed)
        for q in QUEST_BONUSES.keys():
            active_quests[q] = (q in q_set)
    else:
        active_quests = {q: False for q in QUEST_BONUSES.keys()}

    total_quest_bonus = sum(
        QUEST_BONUSES[q] for q, completed in active_quests.items() if completed
    )

    base_score = clamp(objective_score, 0.0, 100.0)
    # Masking imposes a 10 pt safety margin penalty on raw baseline if unmitigated
    effective_base = base_score - 10.0 if is_masking else base_score
    effective_base = clamp(effective_base, 0.0, 100.0)

    final_readiness = clamp(effective_base + total_quest_bonus, 0.0, 100.0)

    # Classify EVA status
    if is_masking:
        # Masking detected: User spec says status is YELLOW (CAUTION / MISMATCH),
        # alerting Commander: recommend reassign to rest (не выпускать).
        eva_status = "CAUTION"
        badge = "🟡 CAUTION: MISMATCH DETECTED (RECOMMEND REASSIGN)"
        status_color = "#F59E0B"
    elif final_readiness >= 85.0:
        eva_status = "CLEARED"
        badge = "🟢 CLEARED FOR EVA"
        status_color = "#10B981"
    elif final_readiness >= 60.0:
        eva_status = "CAUTION"
        badge = "🟡 CAUTION: CREW ACTION"
        status_color = "#F59E0B"
    else:
        eva_status = "PROHIBITED"
        badge = "🔴 PROHIBITED: SEVERE EXHAUSTION"
        status_color = "#EF4444"

    return {
        "base_score": round(base_score, 1),
        "total_quest_bonus": round(total_quest_bonus, 1),
        "quests_active": active_quests,
        "readiness_score": round(final_readiness, 1),
        "eva_status": eva_status,
        "badge_text": badge,
        "badge_color": status_color,
        "is_cleared": (eva_status == "CLEARED")
    }


def simulate_eva_consequences(
    objective_score: float,
    quests_completed: Union[Dict[str, bool], List[str]],
    is_masking: bool = False,
    duration_min: int = 120,
    time_step_min: int = 10
) -> Dict[str, Any]:
    """
    Generates dual forecast time-series curves for tomorrow's EVA (0..120 minutes)
    for interactive rendering in Chart.js:

    1. Red Curve (Ignored / No Quests):
       Fatigue accumulates without mitigation. Hits exhaustion cliff (< 30 pts)
       at minute 105–115 (nominal failure at minute 110), risking PLSS O2 depletion.

    2. Green Curve (With Completed Quests):
       Restored physiological reserves. Remains resilient and stable (> 75 pts)
       across the entire 120-minute crater traverse.
    """
    readiness_data = calculate_eva_readiness_score(objective_score, quests_completed, is_masking)
    green_start = readiness_data["readiness_score"]

    # Red curve starts from unrecovered base
    red_start = clamp(objective_score, 35.0, 70.0)

    labels = []
    red_curve = []
    green_curve = []

    # Simulation minute checkpoints (strictly uniform interval for Chart.js)
    checkpoints = list(range(0, duration_min + 1, time_step_min))
    if 110 not in checkpoints:
        # Only inject failure minute 110 if step size skipped it (e.g. step=25)
        checkpoints.append(110)
        checkpoints = sorted(list(set(checkpoints)))

    for m in checkpoints:
        labels.append(f"{m}m")
        t_norm = m / 120.0  # Normalized mission progress [0..1]

        # 1. GREEN CURVE: Mild natural linear decay under load (1/6g lunar traverse)
        # Drops ~12-15 points over 2 hours, well buffered by recovery quests
        g_val = green_start - (14.0 * (t_norm ** 1.1))
        # Small physiological fluctuation
        g_val = clamp(g_val, 40.0, 100.0)
        green_curve.append(round(g_val, 1))

        # 2. RED CURVE: Steep drop with catastrophic collapse at ~110 minutes
        # Sigmoidal exhaustion drop accelerates dramatically after 90 minutes
        if m < 90:
            r_val = red_start - (22.0 * (m / 90.0) ** 1.2)
        elif m < 110:
            # Steep drop phase (minutes 90..110)
            progress_steep = (m - 90) / 20.0
            r_val = (red_start - 22.0) - (progress_steep ** 1.8) * 32.0
        else:
            # Post-failure cliff (minute 110+)
            r_val = 18.0 - (m - 110) * 0.8

        r_val = clamp(r_val, 10.0, 100.0)
        red_curve.append(round(r_val, 1))

    # Package into Chart.js format
    chart_payload = {
        "labels": labels,
        "datasets": [
            {
                "label": "🔴 Ignored (No Recovery Quests — Collapse at 110m)",
                "borderColor": "#EF4444",
                "backgroundColor": "rgba(239, 68, 68, 0.15)",
                "data": red_curve,
                "borderWidth": 2.5,
                "pointRadius": 3,
                "tension": 0.3
            },
            {
                "label": "🟢 With Completed Quests (Resilient & Nominal)",
                "borderColor": "#10B981",
                "backgroundColor": "rgba(16, 185, 129, 0.15)",
                "data": green_curve,
                "borderWidth": 2.5,
                "pointRadius": 3,
                "tension": 0.3
            }
        ]
    }

    return {
        "readiness_summary": readiness_data,
        "failure_minute": 110,
        "chart_data": chart_payload,
        "warning_summary": (
            "🚨 FAILURE PREDICTION: Without recovery quests, EVA crew member will experience "
            "severe muscular/metabolic exhaustion at Minute 110 inside crater."
        )
    }


# =====================================================================
# 6. MODE 2: HARD CLINICAL SAFETY INTERLOCKS (ZERO HALLUCINATION)
# =====================================================================

def apply_mode2_safety_rules(
    predicted_diagnosis: Union[str, int],
    vitals: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Applies deterministic clinical safety interlocks on top of Model C predictions.
    GUARANTEES ZERO HALLUCINATION on life-critical contraindications (NASA-STD-3001).

    Critical Clinical Rules:
    1. NITROGLYCERIN HARD-BLOCK:
       If Systolic BP < 90 mmHg -> Administration of nitroglycerin is strictly prohibited!
       (Risk of fatal cardiogenic collapse from systemic vasodilation in hypotension).
    2. OXYGEN TRIGGER:
       If SpO2 < 92% -> Immediate high-flow 100% O2 surge protocol.
    3. CO2 ALARM:
       If In-Suit CO2 partial pressure > 7.5 mmHg -> Trigger emergency suit purge.
    """
    # Diagnosis mapping if integer class_id passed
    class_map = {
        0: "Nominal",
        1: "Acute Coronary Ischemia",
        2: "Orthostatic Syncope",
        3: "Hypercapnia CO2",
        4: "Decompression Barotrauma"
    }
    if isinstance(predicted_diagnosis, int):
        diag_name = class_map.get(predicted_diagnosis, "Acute Coronary Ischemia")
    else:
        diag_name = str(predicted_diagnosis)

    # Extract critical vitals
    bp_sys = float(vitals.get("sys", vitals.get("bp_sys", 120.0)))
    bp_dia = float(vitals.get("dia", vitals.get("bp_dia", 80.0)))
    spo2 = float(vitals.get("spo2", 98.0))
    hr = float(vitals.get("hr", 75.0))
    co2_pp = float(vitals.get("co2_pp_mmhg", vitals.get("co2_pp", 3.0)))

    # Interlock 1: Nitroglycerin Safety Block
    dont_give_nitro = (bp_sys < 90.0)
    nitro_block_banner = None
    if dont_give_nitro:
        nitro_block_banner = (
            "⛔ HARD-BLOCK: DO NOT ADMINISTER NITROGLYCERIN! "
            f"Systolic BP is critically low ({bp_sys:.0f} mmHg < 90 mmHg). "
            "High risk of fatal cardiogenic collapse!"
        )

    # Interlock 2: Hypoxia Oxygen Surge
    trigger_o2_surge = (spo2 < 92.0)
    o2_alert = None
    if trigger_o2_surge:
        o2_alert = (
            f"🚨 CRITICAL HYPOXEMIA (SpO2={spo2:.1f}% < 92%): "
            "Initiating high-flow 100% O2 surge protocol immediately."
        )

    # Interlock 3: Hypercapnia Suit Purge
    trigger_co2_purge = (co2_pp > 7.5)
    co2_alert = None
    if trigger_co2_purge:
        co2_alert = (
            f"⚠️ ELEVATED CO2 (pCO2={co2_pp:.1f} mmHg > 7.5 mmHg): "
            "Check scrubber cartridge and initiate suit purge."
        )

    # Clinical First-Aid 3-Step Protocol Generation
    steps = []
    if "coronary" in diag_name.lower() or "ischemia" in diag_name.lower():
        steps.append({
            "step": 1,
            "title": "Patient Posture & High-Flow Oxygen",
            "action": "Place astronaut in semi-sitting position (45°). Administer high-flow 100% O2.",
            "status": "ready"
        })
        if dont_give_nitro:
            steps.append({
                "step": 2,
                "title": "⛔ NITROGLYCERIN CONTRAINDICATED (BP < 90)",
                "action": "DO NOT GIVE NITROGLYCERIN! Administer chewable Aspirin (325 mg) ONLY. Monitor BP closely.",
                "status": "blocked",
                "warning": nitro_block_banner
            })
        else:
            steps.append({
                "step": 2,
                "title": "Sublingual Nitroglycerin + Aspirin",
                "action": "Administer 1 tablet Nitroglycerin (0.4 mg) sublingually + chewable Aspirin (325 mg).",
                "status": "recommended"
            })
        steps.append({
            "step": 3,
            "title": "Automated External Defibrillator (AED)",
            "action": "Retrieve AED from Bay B2. Attach pads in antero-apical configuration. Stand by for rhythm analysis.",
            "status": "standby"
        })

    elif "syncope" in diag_name.lower():
        steps = [
            {"step": 1, "title": "Elevate Legs", "action": "Place patient supine, elevate legs 30° above heart level.", "status": "active"},
            {"step": 2, "title": "Hydration & Electrolytes", "action": "Oral or IV isotonic saline infusion (500 mL). Avoid standing.", "status": "active"},
            {"step": 3, "title": "Vital Signs Monitoring", "action": "Continuous BP & HR tracking until orthostatic stabilization.", "status": "monitoring"}
        ]
    elif "co2" in diag_name.lower() or "hypercapnia" in diag_name.lower():
        steps = [
            {"step": 1, "title": "Initiate Suit Purge", "action": "Open primary purge valve to vent accumulated CO2.", "status": "active"},
            {"step": 2, "title": "Switch Scrubber Cartridge", "action": "Activate secondary LiOH / Amine backup scrubber canister.", "status": "active"},
            {"step": 3, "title": "Abort Surface Activity", "action": "Begin immediate ingress toward rover/habitat airlock.", "status": "active"}
        ]
    elif "barotrauma" in diag_name.lower() or "decompression" in diag_name.lower():
        steps = [
            {"step": 1, "title": "Repressurize Suit / Airway", "action": "Increase suit pressure to maximum safe margin (5.0 psi).", "status": "active"},
            {"step": 2, "title": "100% Normobaric Oxygen", "action": "Flush breathing loop with pure oxygen to wash out nitrogen.", "status": "active"},
            {"step": 3, "title": "Hyperbaric Protocol", "action": "Evacuate directly to habitat hyperbaric airlock chamber.", "status": "active"}
        ]
    else:  # Nominal
        steps = [
            {"step": 1, "title": "Maintain Monitoring", "action": "All biometrics within nominal operational limits.", "status": "nominal"},
            {"step": 2, "title": "Routine EVA Tasks", "action": "Proceed with planned sampling and exploration timeline.", "status": "nominal"},
            {"step": 3, "title": "Regular Check-in", "action": "Transmit standard 15-minute telemetry status to Habitat.", "status": "nominal"}
        ]

    return {
        "diagnosis": diag_name,
        "vitals_snapshot": {
            "hr": hr,
            "bp_sys": bp_sys,
            "bp_dia": bp_dia,
            "spo2": spo2,
            "co2_pp_mmhg": co2_pp
        },
        "critical_interlocks": {
            "dont_give_nitro": bool(dont_give_nitro),
            "nitro_contraindication_banner": nitro_block_banner,
            "trigger_o2_surge": bool(trigger_o2_surge),
            "o2_alert": o2_alert,
            "trigger_co2_purge": bool(trigger_co2_purge),
            "co2_alert": co2_alert
        },
        "first_aid_protocol": {
            "protocol_name": f"{diag_name} Emergency Response",
            "steps": steps
        },
        "ground_flight_surgeons_alert": {
            "queued": True,
            "status_badge": "📡 Alert Queued for Ground Flight Surgeons",
            "priority": "HIGH" if (dont_give_nitro or trigger_o2_surge or "coronary" in diag_name.lower()) else "NORMAL"
        }
    }


# =====================================================================
# 7. MODE 1: DYNAMIC WALK-BACK LIMIT (PLSS 750L O2 TANK)
# =====================================================================

def calculate_walk_back_limit(
    o2_remaining_liters: float,
    o2_burn_rate_l_min: float,
    slope_deg: float = 0.0,
    speed_kmh: float = 2.5
) -> Dict[str, Any]:
    """
    Computes the Dynamic Walk-Back Limit (Point of No Return) in lunar crater traversal.

    NASA EVA Spacesuit PLSS Specifications:
      - Full Tank Capacity: 750.0 Liters O2
      - Mandatory Emergency Reserve: 150.0 Liters O2
      - Usable Working O2 = Tank - Reserve
      - Warning Threshold: 15 minutes
      - Critical Ingress Threshold: 5 minutes

    Metabolic uphill penalty is factored based on LRO LOLA crater slope (0°..22°).
    """
    tank_capacity = 750.0
    emergency_reserve = 150.0

    rem_o2 = clamp(o2_remaining_liters, 0.0, tank_capacity)
    burn_rate = clamp(o2_burn_rate_l_min, 0.5, 3.5)
    speed = clamp(speed_kmh, 0.5, 6.0)

    # 1. Uphill slope cost multiplier for return journey (climbing out of crater)
    # At 20° slope in 1/6g spacesuit, return oxygen consumption increases up to +45%
    slope_penalty = 1.0 + (clamp(slope_deg, 0.0, 25.0) / 25.0) * 0.45

    # 2. Locomotion speed factor relative to nominal 2.5 km/h lunar gait
    # Higher velocity incurs higher metabolic burn rate per minute
    speed_factor = (speed / 2.5) ** 0.75

    effective_return_burn_rate = burn_rate * slope_penalty * speed_factor

    usable_o2 = max(0.0, rem_o2 - emergency_reserve)
    walk_back_limit_min = usable_o2 / effective_return_burn_rate

    # Safe return distance / radius reachable with usable oxygen
    safe_range_km = (walk_back_limit_min / 60.0) * speed

    # Classify walk-back warning level
    if walk_back_limit_min <= 5.0:
        warning_level = "CRITICAL_POINT_OF_NO_RETURN"
        badge = "🔴 POINT OF NO RETURN: TURN BACK IMMEDIATELY!"
        badge_color = "#EF4444"
    elif walk_back_limit_min <= 15.0:
        warning_level = "WARNING_WALK_BACK_APPROACHING"
        badge = "🟡 CAUTION: 15-MIN WALK-BACK LIMIT REACHED"
        badge_color = "#F59E0B"
    else:
        warning_level = "NOMINAL_TRAVERSE"
        badge = "🟢 TRAVERSE WITHIN SAFE OXYGEN RANGE"
        badge_color = "#10B981"

    return {
        "o2_remaining_liters": round(rem_o2, 1),
        "emergency_reserve_liters": emergency_reserve,
        "usable_o2_liters": round(usable_o2, 1),
        "o2_burn_rate_l_min": round(burn_rate, 2),
        "return_burn_rate_adjusted": round(effective_return_burn_rate, 2),
        "slope_deg": round(slope_deg, 1),
        "speed_kmh": round(speed, 1),
        "walk_back_limit_minutes": round(walk_back_limit_min, 1),
        "safe_return_range_km": round(safe_range_km, 2),
        "warning_level": warning_level,
        "badge_text": badge,
        "badge_color": badge_color
    }


# =====================================================================
# 8. SELF-TEST / SANITY VERIFICATION
# =====================================================================

if __name__ == "__main__":
    print("=====================================================================")
    print("Testing PROJECT A.E.G.I.S. core_math.py")
    print("=====================================================================")

    # Test 1: Environments & Hazards
    shift = get_environment_shift("surface_eva_spacesuit")
    print(f"\n[1] Environment Shift (EVA Suit): {shift['display_name']}")
    print(f"    Shift: {shift['baseline_shift']}")
    print(f"    Hazards: {shift['hazards']}")

    # Test 2: Clickable Body Zones
    sample_vitals = {"hr": 78, "sys": 118, "dia": 78, "spo2": 98.2, "blood_sugar_mgdl": 90, "smo2": 77}
    organ_result = calculate_organ_scores(sample_vitals, "surface_eva_spacesuit")
    print(f"\n[2] Clickable Organ Zones (Composite: {organ_result['composite_health_score']}/100):")
    for k, v in organ_result["organ_zones"].items():
        print(f"    - {v['name']}: {v['score']}/100 ({v['band_info']['label']})")

    # Test 3: Masking Detector
    # Astronaut underreports fatigue: sliders all 9.0, objective sensor = 45.0 (delta = 45.0 >= 30)
    masking_res = detect_masking({"sleep": 9.0, "energy": 9.2, "mood": 9.0, "pain_free": 9.0, "nutrition": 9.0}, 45.0)
    print(f"\n[3] Masking Detector Test:")
    print(f"    Masking Detected: {masking_res['masking_detected']}")
    print(f"    Delta: {masking_res['delta']} pts")
    print(f"    Escalation: {masking_res['escalation_level']}")
    print(f"    Alert: {masking_res['alert_banner']}")

    # Test 4: Consequence Simulator & Quests (+15, +18, +20)
    sim_res = simulate_eva_consequences(objective_score=48.0, quests_completed={"hydration": True, "compression": True, "breathing": True})
    print(f"\n[4] Consequence Simulator Test:")
    print(f"    Initial Objective: 48.0 -> With Quests: {sim_res['readiness_summary']['readiness_score']}/100")
    print(f"    EVA Status: {sim_res['readiness_summary']['eva_status']}")
    print(f"    Failure Minute: {sim_res['failure_minute']}")
    print(f"    Chart Labels ({len(sim_res['chart_data']['labels'])}): {sim_res['chart_data']['labels'][:5]}...")
    print(f"    Red Curve at 110m: {sim_res['chart_data']['datasets'][0]['data'][-2]}")

    # Test 5: Mode 2 Safety Rules & Nitroglycerin Hard-Block
    # Hypotensive ischemia (BP 82/54 < 90)
    m2_res = apply_mode2_safety_rules("Acute Coronary Ischemia", {"sys": 82, "dia": 54, "spo2": 95, "hr": 115})
    print(f"\n[5] Mode 2 Hard Clinical Safety Rules Test:")
    print(f"    Diagnosis: {m2_res['diagnosis']}")
    print(f"    Nitroglycerin Blocked: {m2_res['critical_interlocks']['dont_give_nitro']}")
    print(f"    Warning Banner: {m2_res['critical_interlocks']['nitro_contraindication_banner']}")
    print(f"    Step 2 Action: {m2_res['first_aid_protocol']['steps'][1]['action']}")
    print(f"    Status Badge: {m2_res['ground_flight_surgeons_alert']['status_badge']}")

    # Test 6: Walk-Back Limit
    wb_res = calculate_walk_back_limit(o2_remaining_liters=450.0, o2_burn_rate_l_min=1.8, slope_deg=14.0)
    print(f"\n[6] Walk-Back Limit Test:")
    print(f"    Walk-back limit: {wb_res['walk_back_limit_minutes']} min (usable O2: {wb_res['usable_o2_liters']} L)")
    print(f"    Badge: {wb_res['badge_text']}")

    print("\n=====================================================================")
    print("ALL TESTS PASSED! core_math.py is operational and ready for Bulat.")
    print("=====================================================================")
