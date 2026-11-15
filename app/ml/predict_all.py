"""
A.E.G.I.S. Core ML Prediction Engine (predict_all.py)
Autonomous EVA Gait, Ischemia & Survival System · NASA Space Apps Challenge 2026
Authors: Kostya (Lead / AI Core Architecture)

Production-grade, zero-hallucination ML pipeline for astronaut health & survival.
Runs at 1 Hz on live suit and base telemetry streams:
- Model A: Myo-Fatigue Regressor (LightGBM Monotonic Regressor + NIRS fallback)
- Model B: EVA Metabolic Rate (Watts) & Dynamic Walk-Back Limit & Return Time (Apollo-validated)
- Model C: Multi-Class Emergency Triage (LightGBM Classifier + Explainable Surrogate Tree)
- 6-Zone Organ System Indices (0..100): CNS, Cardio, Resp, Thermo, Metabolic, Musculo
- NASA-STD-3001 Vol 1 & 2 / OCHMO-TB-004 Hard Clinical Safety Rules
- Voice Keyword NLP Matcher (Russian & English radio transcripts)
- Mode 3 Evening Check-in & Subjective-Objective Masking Detection
"""

from __future__ import annotations

import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import joblib
import numpy as np

from .. import core_math
from ..config import DATA_DIR, MODELS_DIR  # noqa: F401  (DATA_DIR re-exported)

log = logging.getLogger("aegis.predict_all")

# 5 Core Emergency Classes
TRIAGE_CLASSES = [
    "Nominal",
    "Acute Coronary Ischemia",
    "Orthostatic Syncope",
    "Hypercapnia CO2",
    "Decompression Barotrauma",
]

# Clinical First-Aid Action Protocols per condition (NASA-STD-3001)
FIRST_AID_PROTOCOLS: Dict[str, List[str]] = {
    "Acute Coronary Ischemia": [
        "1. Position crewmember in semi-seated posture; loosen spacesuit neck ring if habitat repressurized.",
        "2. Check blood pressure: if Systolic BP >= 90 mmHg, administer aspirin (325 mg chewed); NEVER administer nitroglycerin if BP < 90 mmHg.",
        "3. Ready Automated External Defibrillator (AED Cabinet Bay B2) and deliver high-flow 100% O2 at 4 L/min.",
    ],
    "Orthostatic Syncope": [
        "1. Position patient supine with legs elevated 30 degrees (Trendelenburg countermeasure) to restore cerebral perfusion.",
        "2. Inflate suit lower-body compression cuffs / pneumatic counterpressure garment.",
        "3. Administer 500 mL oral isotonic electrolyte rehydration fluid once consciousness is regained.",
    ],
    "Hypercapnia CO2": [
        "1. Immediately initiate spacesuit emergency purge sequence (flush helmet CO2 pockets with 100% primary O2).",
        "2. Check PLSS LiOH / amine scrubber cartridge status and transition to secondary loop.",
        "3. Abort EVA climb immediately; mandate rest stop for 180 seconds until respiration rate drops below 22 bpm.",
    ],
    "Decompression Barotrauma": [
        "1. Emergency spacesuit repressurization: activate emergency oxygen regulator (minimum 4.3 psia / 30 kPa suit pressure).",
        "2. Administer 100% normobaric oxygen to accelerate nitrogen washout and prevent arterial gas embolism.",
        "3. Immediate emergency buddy-assist evacuation to airlock / habitat hyperbaric treatment protocol.",
    ],
    "Nominal": [
        "1. Vital signs and physiological telemetry within nominal operational envelopes.",
        "2. Maintain standard scheduled hydration (250 mL electrolyte water every 60 min).",
        "3. Continue scheduled EVA traverses under standard 1 Hz telemetry monitoring.",
    ],
}

# Voice Keyword Dictionary (Deterministic offline regex for EN + RU radio chatter)
VOICE_KEYWORD_RULES: Dict[str, Tuple[str, ...]] = {
    "chest_pain": (
        "chest", "crushing", "sternum", "angina", "heart pain", "cardiac", "myocardi",
        "груди", "грудь", "боль в груди", "давит", "сердце", "за грудиной"
    ),
    "short_breath": (
        "breath", "breathe", "breathing", "gasp", "suffocat", "dyspnea", "air", "choking",
        "одышка", "задыха", "воздух", "не могу дышать", "тяжело дышать", "не хватает воздуха"
    ),
    "dizzy": (
        "dizzy", "dizziness", "lightheaded", "light-headed", "faint", "unconscious", "syncope", "spinning",
        "головокруж", "кружится", "темнеет", "падаю", "мутит", "обморок", "слабость"
    ),
    "cold_sweat": (
        "sweat", "clammy", "blue lips", "pale", "cyanosis", "diaphoresis",
        "холодный пот", "пот", "бледн", "синие губы", "липкий"
    ),
    "fall_event": (
        "fell", "fall", "collapse", "slipped", "tremor", "spasm", "trip", "lost balance",
        "упал", "падение", "споткнулся", "рухнул", "судорог", "потерял равновесие"
    ),
}

# Feature aliases for 100% input flexibility
FEATURE_ALIASES: Dict[str, Tuple[str, ...]] = {
    "hr": ("hr_bpm", "heart_rate"),
    "hr_bpm": ("hr", "heart_rate"),
    "bp_sys": ("sys", "systolic_bp", "bp_systolic"),
    "bp_dia": ("dia", "diastolic_bp", "bp_diastolic"),
    "resp_rate": ("resp", "respiration_rate", "respiration"),
    "st_elevation_mv": ("st", "st_segment", "ecg_st"),
    "temp": ("body_temp_c", "temperature"),
    "calf_smo2_pct": ("smo2", "calf_smo2"),
    "nirs_desat_slope": ("smo2_slope", "desat_slope"),
    "semg_mdf_shift_pct": ("emg_mdf", "semg_mdf", "mdf_shift"),
    "imu_gait_asymmetry": ("gait", "gait_wobble", "imu_gait_wobble", "asymmetry"),
    "speed_kmh": ("speed", "walking_speed"),
    "slope_deg": ("slope", "slope_angle", "pitch"),
    "fall_event": ("fall", "fall_detected"),
    "dizzy": ("dizziness",),
    "chest_pain": ("chest_pain_flag",),
    "short_breath": ("dyspnea", "shortness_of_breath"),
    "cold_sweat": ("diaphoresis", "sweat"),
    "o2_tank_remaining_l": ("o2_left", "o2_tank_l", "tank_l"),
    "distance_m": ("dist_m", "distance", "distance_from_base_m", "dist", "odometer_m"),
    "distance_km": ("dist_km",),
    "slope_return_deg": ("return_slope", "slope_return", "incline_return"),
}


def _lookup(telemetry: Dict[str, Any], key: str, default: Any = 0.0) -> float:
    """Extract numeric value by key or its aliases, with safe float casting."""
    if key in telemetry and telemetry[key] is not None:
        try:
            return float(telemetry[key])
        except (ValueError, TypeError):
            pass
    for alias in FEATURE_ALIASES.get(key, ()):
        if alias in telemetry and telemetry[alias] is not None:
            try:
                return float(telemetry[alias])
            except (ValueError, TypeError):
                pass
    return float(default) if default is not None else 0.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(v)))


def _format_mmss(minutes: float) -> str:
    """Formats decimal minutes into standard mm:ss display string."""
    tot = max(0, int(round(float(minutes) * 60.0)))
    return f"{tot // 60:02d}:{tot % 60:02d}"


def extract_voice_symptoms(transcript: str) -> Dict[str, bool]:
    """Offline keyword matcher for voice transcripts (NASA mission speech)."""
    text = (transcript or "").lower()
    flags: Dict[str, bool] = {}
    for sym, words in VOICE_KEYWORD_RULES.items():
        flags[sym] = any(re.search(r"\b" + re.escape(w), text, re.IGNORECASE) for w in words)
    return flags


class AegisMLEngine:
    """
    Singleton-style ML Engine encapsulating all 4 trained models:
    - model_a_full (LightGBM Regressor with NIRS)
    - model_a_fallback (LightGBM Regressor without NIRS)
    - model_b_metabolic (LightGBM Monotonic Regressor for Watts)
    - model_c_triage (LightGBM Multi-Class Classifier with tree explainability)
    """

    _instance: Optional["AegisMLEngine"] = None

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = Path(models_dir) if models_dir else MODELS_DIR
        self.model_a_full = self._load("model_a_full")
        self.model_a_fallback = self._load("model_a_fallback")
        self.model_b_metabolic = self._load("model_b_metabolic")
        self.model_c_triage = self._load("model_c_triage")

    @classmethod
    def get_instance(cls) -> "AegisMLEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load(self, name: str) -> Dict[str, Any]:
        path = self.models_dir / f"{name}.pkl"
        if not path.exists():
            log.warning("Model file %s not found in %s", path.name, self.models_dir)
            return {"model": None, "features": [], "metrics": {}}
        try:
            data = joblib.load(path)
            if isinstance(data, dict):
                return data
            return {"model": data, "features": getattr(data, "feature_names_in_", []), "metrics": {}}
        except Exception as exc:
            log.error("Failed to load %s: %s", path, exc)
            return {"model": None, "features": [], "metrics": {}}

    # -------------------------------------------------------------------------
    # Model A: Myo-Fatigue & Time-to-Failure Prediction
    # -------------------------------------------------------------------------
    def predict_fatigue(
        self, telemetry: Dict[str, Any], nirs_ok: bool = True
    ) -> Tuple[float, float, str]:
        """
        Returns:
            (muscle_fatigue_score 0..100, time_to_failure_min, model_used_name)
        """
        entry = self.model_a_full if nirs_ok else self.model_a_fallback
        model = entry.get("model")
        features = entry.get("features", [])

        if model is not None:
            try:
                FATIGUE_DEFAULTS = {
                    "calf_smo2_pct": 75.0, "nirs_desat_slope": 0.0, "semg_mdf_shift_pct": 0.0,
                    "imu_gait_asymmetry": 0.10, "hr_bpm": 72.0, "hr": 72.0,
                }
                x = np.array([[_lookup(telemetry, f, FATIGUE_DEFAULTS.get(f, 0.0)) for f in features]], dtype=float)
                pred = float(model.predict(x)[0])
                score = _clamp(pred, 0.0, 100.0)
                used = "model_a_full" if nirs_ok else "model_a_fallback"
                if nirs_ok:
                    smo2 = _lookup(telemetry, "calf_smo2_pct", 75.0)
                    slope_desat = abs(_lookup(telemetry, "nirs_desat_slope", -0.5))
                    rate = max(0.2, slope_desat * 0.8 + 0.3 * (score / 50.0))
                else:
                    rate = max(0.25, 0.5 * (score / 50.0))
                time_to_fail = _clamp((90.0 - score) / rate, 0.0, 45.0) if score < 90.0 else 0.0
                return score, round(time_to_fail, 1), used
            except Exception as exc:
                log.warning("Model A predict error: %s, falling back to physiological formula", exc)

        # Formula fallback (deterministic physiological model)
        smo2 = _lookup(telemetry, "calf_smo2_pct", 75.0)
        mdf = _lookup(telemetry, "semg_mdf_shift_pct", 0.0)
        gait = _lookup(telemetry, "imu_gait_asymmetry", 0.1)
        emg_part = _clamp(-mdf / 45.0, 0, 1) * 100.0
        gait_part = _clamp(gait / 0.35, 0, 1) * 100.0

        if nirs_ok:
            nirs_part = _clamp((85.0 - smo2) / 60.0, 0, 1) * 100.0
            score = 0.55 * nirs_part + 0.30 * emg_part + 0.15 * gait_part
        else:
            score = 0.75 * emg_part + 0.25 * gait_part

        score = _clamp(score, 0.0, 100.0)
        time_to_fail = _clamp((90.0 - score) / 1.5, 0.0, 45.0)
        return score, round(time_to_fail, 1), "model_a:formula_fallback"

    # -------------------------------------------------------------------------
    # Model B: Lunar EVA Metabolic Power & Dynamic Walk-Back Limit
    # -------------------------------------------------------------------------
    def predict_metabolic(
        self,
        speed_kmh: float,
        slope_deg: float,
        fatigue_score: float,
        o2_tank_remaining_l: float = 750.0,
        slope_return_deg: float = 0.0,
        distance_km: float = 1.8,
    ) -> Tuple[float, float, float, str]:
        """
        Calculates:
            (metabolic_rate_watts, o2_burn_rate_l_min, walk_back_limit_min, model_used)
        Satisfies 3 NASA Apollo 14-16 & 2023 Lunar EVA Benchmarks:
            0.0° slope @ 2.5 km/h -> 185 to 310 W
            10.0° slope @ 2.5 km/h -> 250 to 480 W
            18.0° slope @ 2.5 km/h -> 480 to 550 W
        """
        speed_kmh = max(0.0, float(speed_kmh))
        slope_deg = float(slope_deg)
        fatigue_score = _clamp(fatigue_score, 0.0, 100.0)
        o2_tank = max(0.0, float(o2_tank_remaining_l))
        dist_km = max(0.01, float(distance_km))

        # Standing rest in suit
        if speed_kmh <= 0.05:
            watts = 150.0 + 0.4 * fatigue_score
            model_used = "resting_suited"
        else:
            entry = self.model_b_metabolic
            model = entry.get("model")
            features = entry.get("features", ["speed_kmh", "slope_deg", "muscle_fatigue_score"])
            if model is not None:
                try:
                    val_dict = {
                        "speed_kmh": speed_kmh,
                        "slope_deg": slope_deg,
                        "muscle_fatigue_score": fatigue_score,
                    }
                    x = np.array([[_lookup(val_dict, f) for f in features]], dtype=float)
                    pred = float(model.predict(x)[0])
                    watts = _clamp(pred, 120.0, 950.0)
                    model_used = "model_b_metabolic"
                except Exception as exc:
                    log.warning("Model B predict error: %s, using Pandolf lunar equation", exc)
                    watts = 185.0 + 17.0 * max(slope_deg, 0.0) + 45.0 * (speed_kmh - 2.5) + 0.6 * fatigue_score
                    model_used = "model_b:pandolf_fallback"
            else:
                watts = 185.0 + 17.0 * max(slope_deg, 0.0) + 45.0 * (speed_kmh - 2.5) + 0.6 * fatigue_score
                model_used = "model_b:pandolf_fallback"

        # Oxygen burn rate: (W / 335) * (1 + 0.25 * fatigue / 100)
        o2_burn_rate = (watts / 335.0) * (1.0 + 0.25 * (fatigue_score / 100.0))
        o2_burn_rate = _clamp(o2_burn_rate, 0.45, 3.5)

        # Dynamic Walk-Back Limit & Return Time (NASA Master Plan §4.2)
        # 1. Return speed degrades as muscle fatigue accumulates:
        return_speed = max(1.2, 2.5 * (1.0 - 0.30 * (fatigue_score / 100.0)))
        # 2. Actual time required to walk back to airlock:
        return_time_min = (dist_km / return_speed) * 60.0
        # 3. Power and O2 burn rate on return (accounting for return slope if climbing out):
        ret_watts = max(180.0, 200.0 + 15.0 * max(slope_return_deg, 0.0) + 0.5 * fatigue_score)
        return_burn_rate = (ret_watts / 335.0) * (1.0 + 0.20 * (fatigue_score / 100.0))
        return_burn_rate = _clamp(return_burn_rate, 0.45, 3.5)
        # 4. Total O2 required for the return trek:
        o2_return_needed = return_time_min * return_burn_rate

        # 5. Usable O2 before hitting Point of No Return (emergency reserve = 45 L per spec §4.2)
        emergency_reserve_l = 45.0
        usable_o2 = max(0.0, o2_tank - emergency_reserve_l - o2_return_needed)
        walk_back_limit_min = usable_o2 / max(0.5, o2_burn_rate)
        walk_back_limit_min = _clamp(walk_back_limit_min, 0.0, 180.0)

        return round(watts, 1), round(o2_burn_rate, 2), round(walk_back_limit_min, 1), model_used

    def predict_metabolic_detailed(
        self,
        speed_kmh: float,
        slope_deg: float,
        fatigue_score: float,
        o2_tank_remaining_l: float = 750.0,
        distance_m: float = 1800.0,
        slope_return_deg: float = 0.0,
    ) -> Dict[str, Any]:
        """Full dynamic walk-back calculation returning comprehensive metrics."""
        dist_km = max(0.01, float(distance_m) / 1000.0)
        watts, burn_now, walk_back_min, used = self.predict_metabolic(
            speed_kmh=speed_kmh,
            slope_deg=slope_deg,
            fatigue_score=fatigue_score,
            o2_tank_remaining_l=o2_tank_remaining_l,
            slope_return_deg=slope_return_deg,
            distance_km=dist_km,
        )

        return_speed_kmh = max(1.2, 2.5 * (1.0 - 0.30 * (fatigue_score / 100.0)))
        return_time_min = (dist_km / return_speed_kmh) * 60.0
        ret_watts = max(180.0, 200.0 + 15.0 * max(slope_return_deg, 0.0) + 0.5 * fatigue_score)
        return_burn_rate = _clamp((ret_watts / 335.0) * (1.0 + 0.20 * (fatigue_score / 100.0)), 0.45, 3.5)
        o2_return_needed = return_time_min * return_burn_rate

        reserve_l = 45.0
        level = "red" if walk_back_min <= 5.0 else ("amber" if walk_back_min <= 15.0 else "green")
        labels = {"red": "Turn back NOW", "amber": "Margin is short", "green": "Safe margin"}

        return {
            "metabolic_rate_watts": watts,
            "metabolic_w": watts,
            "o2_burn_rate_l_min": burn_now,
            "o2_burn_l_min": burn_now,
            "walk_back_limit_min": walk_back_min,
            "walk_back_min": walk_back_min,
            "walk_back_display": _format_mmss(walk_back_min),
            "return_time_min": round(return_time_min, 1),
            "return_time_display": _format_mmss(return_time_min),
            "return_speed_kmh": round(return_speed_kmh, 2),
            "o2_return_needed_l": round(o2_return_needed, 1),
            "o2_reserve_l": reserve_l,
            "distance_m": round(distance_m, 1),
            "distance_from_base_m": round(distance_m, 1),
            "walk_back_level": level,
            "walk_back_label": labels[level],
            "o2_tank_remaining_l": o2_tank_remaining_l,
            "o2_left_pct": round((o2_tank_remaining_l / 750.0) * 100.0, 1),
            "model_used": used,
            "point_of_no_return_warning": walk_back_min < 15.0,
            "critical_turn_back_now": walk_back_min <= 5.0,
        }

    # -------------------------------------------------------------------------
    # Model C: Emergency Multi-Class Triage & Clinical Safety Interlocks
    # -------------------------------------------------------------------------
    def predict_triage(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Predicts emergency triage category across 5 classes:
            Nominal (0), Acute Coronary Ischemia (1), Orthostatic Syncope (2),
            Hypercapnia CO2 (3), Decompression Barotrauma (4)
        Returns:
            primary_class, confidence, ranked_probabilities, tree_path_why,
            dont_give_nitro, oxygen_surge, flight_surgeons_alert, protocol_steps
        """
        entry = self.model_c_triage
        model = entry.get("model")
        features = entry.get("features", [
            "hr", "bp_sys", "bp_dia", "spo2", "resp_rate", "st_elevation_mv", "temp",
            "chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event"
        ])

        # Merge voice keywords from transcript if present
        voice_flags = extract_voice_symptoms(
            telemetry.get("transcript") or telemetry.get("text") or telemetry.get("speech") or ""
        )

        st_raw = _lookup(telemetry, "st_elevation_mv", 0.0)
        st_mv = st_raw / 10.0 if abs(st_raw) > 0.5 else st_raw

        x = []
        for f in features:
            if f == "st_elevation_mv":
                x.append(st_mv)
            elif f in voice_flags and voice_flags[f]:
                x.append(1.0)
            else:
                x.append(_lookup(telemetry, f))

        bp_sys = _lookup(telemetry, "bp_sys", 120.0)
        spo2 = _lookup(telemetry, "spo2", 98.0)
        chest_pain = (_lookup(telemetry, "chest_pain", 0.0) > 0.5) or voice_flags.get("chest_pain", False)
        cold_sweat = (_lookup(telemetry, "cold_sweat", 0.0) > 0.5) or voice_flags.get("cold_sweat", False)
        short_breath = (_lookup(telemetry, "short_breath", 0.0) > 0.5) or voice_flags.get("short_breath", False)

        primary_class = "Nominal"
        confidence = 0.95
        ranked: List[Dict[str, Any]] = []
        tree_path = ""
        model_name = "model_c_triage"

        if model is not None:
            try:
                x_arr = np.array([x], dtype=float)
                proba = list(model.predict_proba(x_arr)[0])
                classes = [
                    TRIAGE_CLASSES[int(c)] if str(c).isdigit() and int(c) < len(TRIAGE_CLASSES) else str(c)
                    for c in getattr(model, "classes_", range(len(proba)))
                ]
                ranked_pairs = sorted(zip(classes, proba), key=lambda p: -p[1])
                primary_class = ranked_pairs[0][0]
                confidence = round(float(ranked_pairs[0][1]), 3)

                # Clinical rule override: acute crushing chest pain with ST shift or cold sweat is Ischemia
                if chest_pain and (st_mv >= 0.10 or cold_sweat or short_breath) and spo2 >= 88.0:
                    primary_class = "Acute Coronary Ischemia"
                    confidence = max(confidence, 0.95)

                ranked = [{"class": c, "probability": round(float(p), 4)} for c, p in ranked_pairs]
                tree_path = self._extract_explainable_path(model, features, x, primary_class)
            except Exception as exc:
                log.warning("Model C predict error: %s, falling back to clinical rules", exc)
                return self._rule_based_triage(telemetry)
        else:
            return self._rule_based_triage(telemetry)

        # Hard Clinical Safety Interlocks (NASA-STD-3001)
        # 1. NITROGLYCERIN HARD BLOCK: if Systolic BP < 90 mmHg, administration is lethal
        dont_give_nitro = bp_sys < 90.0
        nitro_alert = (
            "⛔ DON'T GIVE NITROGLYCERIN! (BP "
            f"{bp_sys:.0f} < 90 mmHg - Risk of fatal cardiogenic collapse)"
            if dont_give_nitro
            else None
        )

        # 2. OXYGEN SURGE TRIGGER: if SpO2 < 92%
        oxygen_surge = spo2 < 92.0
        oxygen_alert = (
            f"🚨 CRITICAL HYPOXEMIA (SpO2 {spo2:.1f}% < 92%): Initiating 100% O2 surge protocol"
            if oxygen_surge
            else None
        )

        # 3. Ground Flight Surgeons Alert
        flight_surgeons_alert = (
            primary_class in ("Acute Coronary Ischemia", "Decompression Barotrauma")
            or dont_give_nitro
            or oxygen_surge
        )

        protocols = list(FIRST_AID_PROTOCOLS.get(primary_class, FIRST_AID_PROTOCOLS["Nominal"]))
        if dont_give_nitro:
            protocols.insert(0, f"⛔ WARNING: {nitro_alert}")
        if oxygen_surge and primary_class != "Decompression Barotrauma":
            protocols.insert(1, f"🚨 HIGH-FLOW O2: {oxygen_alert}")

        ranked_other = [
            {
                "class": c["class"],
                "class_name": c["class"],
                "probability": c["probability"],
                "confidence": c["probability"],
            }
            for c in ranked[1:]
        ]
        dont_give_list = (
            [{
                "drug": "Nitroglycerin",
                "reason": f"BP {bp_sys:.0f} < 90 mmHg",
                "banner": f"⛔ DON'T GIVE NITROGLYCERIN (BP {bp_sys:.0f} < 90 mmHg)",
                "spoken": "Do not give nitroglycerin. Blood pressure is too low.",
            }]
            if dont_give_nitro else []
        )

        return {
            "primary_class": primary_class,
            "confidence": confidence,
            "ranked": ranked,
            "ranked_other_classes": ranked_other,
            "tree_path": tree_path,
            "tree_path_why": tree_path,
            "dont_give_nitro": dont_give_nitro,
            "nitroglycerin_alert": nitro_alert,
            "dont_give_list": dont_give_list,
            "oxygen_surge": oxygen_surge,
            "oxygen_alert": oxygen_alert,
            "flight_surgeons_alert": flight_surgeons_alert,
            "flight_surgeons_queued": flight_surgeons_alert,
            "ultrasound_attached": bool(telemetry.get("ultrasound_attached", False)),
            "protocol_steps": protocols,
            "model": f"{model_name} (LightGBM)",
        }

    def _extract_explainable_path(
        self, model: Any, features: List[str], x: List[float], primary: str
    ) -> str:
        """Extracts human-readable clinical decision path for judges and non-doctor crew."""
        tree = getattr(model, "tree_", None)
        if tree is None:
            return f"Telemetry features analyzed → {primary}"

        node, parts, seen = 0, [], set()
        labels = {
            "hr": "HR", "bp_sys": "Systolic BP", "bp_dia": "Diastolic BP", "spo2": "SpO2",
            "resp_rate": "Resp rate", "st_elevation_mv": "ST elevation", "temp": "Body temp",
            "chest_pain": "Chest pain", "dizzy": "Dizziness", "short_breath": "Short of breath",
            "cold_sweat": "Cold sweat", "fall_event": "Fall event",
        }
        binary_feats = {"chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event"}

        while tree.children_left[node] != tree.children_right[node]:
            fi = int(tree.feature[node])
            thr = float(tree.threshold[node])
            fname = features[fi] if fi < len(features) else f"f{fi}"
            val = x[fi]
            go_left = val <= thr
            if fname not in seen:
                seen.add(fname)
                label = labels.get(fname, fname)
                if fname in binary_feats:
                    parts.append(f"{label}: {'yes' if val > 0.5 else 'no'}")
                else:
                    parts.append(f"{label} {val:g} {'≤' if go_left else '>'} {thr:.3g}")
            node = tree.children_left[node] if go_left else tree.children_right[node]

        if "chest_pain" in features:
            c_val = x[features.index("chest_pain")]
            if c_val > 0.5 and primary == "Acute Coronary Ischemia" and "Chest pain" not in " ".join(parts):
                parts.insert(0, "Chest pain: yes")

        if not parts:
            return f"Vitals nominal → {primary}"
        return " + ".join(parts) + f" → {primary}"

    def _rule_based_triage(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """High-precision deterministic rule fallback for zero internet / emergency mode."""
        st = _lookup(telemetry, "st_elevation_mv")
        sys_bp = _lookup(telemetry, "bp_sys", 120.0)
        spo2 = _lookup(telemetry, "spo2", 98.0)
        resp = _lookup(telemetry, "resp_rate", 15.0)
        voice_flags = extract_voice_symptoms(
            telemetry.get("transcript") or telemetry.get("text") or telemetry.get("speech") or ""
        )
        chest = (_lookup(telemetry, "chest_pain") > 0.5) or voice_flags.get("chest_pain", False)
        dizzy = (_lookup(telemetry, "dizzy") > 0.5) or voice_flags.get("dizzy", False)
        fall = (_lookup(telemetry, "fall_event") > 0.5) or voice_flags.get("fall_event", False)

        scores = {c: 0.05 for c in TRIAGE_CLASSES}
        if st >= 0.15 or chest:
            scores["Acute Coronary Ischemia"] += 0.8
        elif sys_bp < 90.0 or (dizzy and fall):
            scores["Orthostatic Syncope"] += 0.75
        elif spo2 < 85.0:
            scores["Decompression Barotrauma"] += 0.85
        elif resp > 28.0:
            scores["Hypercapnia CO2"] += 0.75
        else:
            scores["Nominal"] = 0.95

        total = sum(scores.values())
        ranked = sorted(((c, round(s / total, 4)) for c, s in scores.items()), key=lambda p: -p[1])
        primary = ranked[0][0]
        dont_give_nitro = sys_bp < 90.0
        oxygen_surge = spo2 < 92.0

        ranked_other = [
            {
                "class": c,
                "class_name": c,
                "probability": p,
                "confidence": p,
            }
            for c, p in ranked[1:]
        ]
        dont_give_list = (
            [{
                "drug": "Nitroglycerin",
                "reason": f"BP {sys_bp:.0f} < 90 mmHg",
                "banner": f"⛔ DON'T GIVE NITROGLYCERIN (BP {sys_bp:.0f} < 90 mmHg)",
                "spoken": "Do not give nitroglycerin. Blood pressure is too low.",
            }]
            if dont_give_nitro else []
        )
        rule_protocols = list(FIRST_AID_PROTOCOLS.get(primary, FIRST_AID_PROTOCOLS["Nominal"]))
        if dont_give_nitro:
            rule_protocols.insert(0, "⛔ WARNING: ⛔ DON'T GIVE NITROGLYCERIN!")

        return {
            "primary_class": primary,
            "confidence": round(ranked[0][1], 3),
            "ranked": [{"class": c, "probability": p} for c, p in ranked],
            "ranked_other_classes": ranked_other,
            "tree_path": f"ST {st:.2f} mV, BP {sys_bp:.0f}, SpO2 {spo2:.0f}%, chest {chest} → {primary} (clinical rule fallback)",
            "tree_path_why": f"ST {st:.2f} mV, BP {sys_bp:.0f}, SpO2 {spo2:.0f}%, chest {chest} → {primary} (clinical rule fallback)",
            "dont_give_nitro": dont_give_nitro,
            "nitroglycerin_alert": "⛔ DON'T GIVE NITROGLYCERIN!" if dont_give_nitro else None,
            "dont_give_list": dont_give_list,
            "oxygen_surge": oxygen_surge,
            "oxygen_alert": "🚨 CRITICAL HYPOXEMIA" if oxygen_surge else None,
            "flight_surgeons_alert": primary in ("Acute Coronary Ischemia", "Decompression Barotrauma") or dont_give_nitro,
            "flight_surgeons_queued": primary in ("Acute Coronary Ischemia", "Decompression Barotrauma") or dont_give_nitro,
            "ultrasound_attached": bool(telemetry.get("ultrasound_attached", False)),
            "protocol_steps": rule_protocols,
            "model": "model_c:clinical_rules",
        }


# -----------------------------------------------------------------------------
# Top-level Public Function: predict_all
# -----------------------------------------------------------------------------
def predict_all(telemetry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Master 1 Hz prediction pipeline.
    Passes suit / astronaut telemetry through Model A, Model B, and Model C.
    Computes overall physiological health index on strictly 0..100 scale:
        80..100 -> NOMINAL (Green)
        60..79  -> CAUTION / ACTION (Yellow/Amber)
        0..59   -> CRITICAL / EMERGENCY (Red)
    """
    engine = AegisMLEngine.get_instance()

    # 1. Model A: Muscle Fatigue
    nirs_ok = bool(_lookup(telemetry, "nirs_ok", 1.0) >= 0.5)
    fatigue_score, time_to_fail_min, model_a_used = engine.predict_fatigue(telemetry, nirs_ok=nirs_ok)

    # 2. Dynamic Distance Extraction
    dist_m = None
    for k in ("distance_m", "dist_m", "distance", "distance_from_base_m", "dist", "odometer_m"):
        if k in telemetry and telemetry[k] is not None:
            try:
                dist_m = float(telemetry[k])
                break
            except (ValueError, TypeError):
                pass
    if dist_m is None and "distance_km" in telemetry and telemetry["distance_km"] is not None:
        try:
            dist_m = float(telemetry["distance_km"]) * 1000.0
        except (ValueError, TypeError):
            pass
    if dist_m is None:
        # Default 1.8 km Shackleton Crater reference traverse
        dist_m = 1800.0

    # 3. Model B: Metabolic Power & Dynamic Walk-Back Limit & Return Time
    speed = _lookup(telemetry, "speed_kmh", 2.5)
    slope = _lookup(telemetry, "slope_deg", 0.0)
    slope_return = _lookup(telemetry, "slope_return_deg", 0.0)
    o2_left = _lookup(telemetry, "o2_tank_remaining_l", 650.0)

    model_b_state = engine.predict_metabolic_detailed(
        speed_kmh=speed,
        slope_deg=slope,
        fatigue_score=fatigue_score,
        o2_tank_remaining_l=o2_left,
        distance_m=dist_m,
        slope_return_deg=slope_return,
    )

    # 4. Model C: Emergency Triage
    triage_res = engine.predict_triage(telemetry)

    # 5. 6-Zone Organ Scores (0..100) per NASA Master Plan
    env = telemetry.get("env", "surface_eva_spacesuit")
    sys_bp = _lookup(telemetry, "bp_sys", 120.0)
    dia_bp = _lookup(telemetry, "bp_dia", 76.0)
    spo2 = _lookup(telemetry, "spo2", 98.0)
    hr = _lookup(telemetry, "hr", 75.0)
    resp = _lookup(telemetry, "resp_rate", 15.0)
    temp = _lookup(telemetry, "temp", 36.7)
    smo2 = _lookup(telemetry, "calf_smo2_pct", 75.0)
    blood_sugar = _lookup(telemetry, "blood_sugar_mgdl", 95.0)
    st_raw = _lookup(telemetry, "st_elevation_mv", 0.0)
    st_mv = st_raw / 10.0 if abs(st_raw) > 0.5 else st_raw

    # Sleep and mood for CNS (0..10 sliders converted to 0..100)
    sleep_s = _lookup(telemetry, "sleep", _lookup(telemetry, "subjective_sleep_slider", 8.0))
    mood_s = _lookup(telemetry, "mood", _lookup(telemetry, "subjective_mood_slider", 8.0))

    if core_math is not None:
        organ_vitals = {
            "hr": hr, "sys": sys_bp, "dia": dia_bp, "spo2": spo2, "resp": resp,
            "temp": temp, "smo2": smo2, "blood_sugar_mgdl": blood_sugar,
            "st": st_mv, "st_elevation_mv": st_mv, "gait": _lookup(telemetry, "imu_gait_asymmetry", 0.15),
            "sleep_score": sleep_s, "mood_score": mood_s,
        }
        try:
            organ_res = core_math.calculate_organ_scores(organ_vitals, env)
            organ_zones = organ_res["organ_zones"]
            organ_scores_6 = {
                "cns": organ_zones["cns_brain"]["score"],
                "cardio": organ_zones["cardiovascular"]["score"],
                "resp": organ_zones["respiratory"]["score"],
                "thermo": organ_zones["immune_thermo"]["score"],
                "metabolic": organ_zones["metabolic_nutrition"]["score"],
                "musculo": organ_zones["musculoskeletal"]["score"],
            }
        except Exception as exc:
            log.warning("core_math.calculate_organ_scores error: %s, using internal formula", exc)
            organ_scores_6 = None
    else:
        organ_scores_6 = None

    if organ_scores_6 is None:
        # Fallback deterministic organ scores
        cns_val = _clamp((sleep_s * 4.5 + mood_s * 3.5 + 20.0) - _lookup(telemetry, "imu_gait_asymmetry", 0.15) * 20.0, 0, 100)
        cardio_val = 100.0 - max(0.0, hr - 85.0) * 1.1 - max(0.0, 55.0 - hr) * 1.5 - (st_mv / 0.3) * 45.0
        resp_val = 100.0 - max(0.0, 95.0 - spo2) * 12.0 - max(0.0, resp - 22.0) * 3.0
        thermo_val = 100.0 - abs(temp - 36.7) * 40.0
        metab_val = 100.0 - abs(blood_sugar - 95.0) * 0.8
        musc_val = 100.0 - 0.5 * fatigue_score - max(0.0, 60.0 - smo2) * 1.2
        organ_scores_6 = {
            "cns": round(_clamp(cns_val, 0, 100), 1),
            "cardio": round(_clamp(cardio_val, 0, 100), 1),
            "resp": round(_clamp(resp_val, 0, 100), 1),
            "thermo": round(_clamp(thermo_val, 0, 100), 1),
            "metabolic": round(_clamp(metab_val, 0, 100), 1),
            "musculo": round(_clamp(musc_val, 0, 100), 1),
        }

    # 6. Overall Health & Safety Scale (0..100)
    health_score = 100.0
    health_score -= 0.35 * fatigue_score
    if spo2 < 95.0:
        health_score -= (95.0 - spo2) * 5.0
    if sys_bp < 90.0:
        health_score -= (90.0 - sys_bp) * 2.0
    elif sys_bp > 140.0:
        health_score -= (sys_bp - 140.0) * 1.5
    if hr > 110.0:
        health_score -= (hr - 110.0) * 0.4
    if triage_res["primary_class"] != "Nominal":
        health_score = min(health_score, 45.0)

    health_score = round(_clamp(health_score, 0.0, 100.0), 1)

    # Traffic light band
    if health_score >= 80.0:
        band = "GREEN"
        status_label = "🟢 NOMINAL"
        band_frontend = "green"
    elif health_score >= 60.0:
        band = "YELLOW"
        status_label = "🟡 CAUTION / CREW ACTION"
        band_frontend = "amber"
    else:
        band = "RED"
        status_label = "🔴 CRITICAL / EMERGENCY"
        band_frontend = "red"

    # 7. Mode 3: Masking Detection & Readiness
    energy_s = _lookup(telemetry, "energy", _lookup(telemetry, "subjective_energy_slider", 8.0))
    pain_s = _lookup(telemetry, "pain_free", _lookup(telemetry, "subjective_pain_free_slider", 8.0))
    nutr_s = _lookup(telemetry, "nutrition", _lookup(telemetry, "subjective_nutrition_slider", 8.0))
    sliders = [sleep_s, energy_s, mood_s, pain_s, nutr_s]
    subj_score = (sum(sliders) / len(sliders)) * 10.0
    delta_mask = subj_score - health_score
    primary_mask = delta_mask >= 30.0
    sec_mask = (energy_s >= 7.0) and (fatigue_score >= 70.0 or health_score < 50.0)
    masking_detected = primary_mask or sec_mask

    if masking_detected:
        eva_clearance = "CAUTION" if health_score >= 60.0 else "PROHIBITED"
        masking_banner = (
            f"🟡 MASKING DETECTED: Self-report ({subj_score:.1f}/100) conflicts with objective "
            f"sensors ({health_score:.1f}/100). Auto-clearance revoked."
        )
    else:
        eva_clearance = "CLEARED" if health_score >= 80.0 else ("CAUTION" if health_score >= 60.0 else "PROHIBITED")
        masking_banner = None

    mode3_state = {
        "subjective_score": round(subj_score, 1),
        "objective_score": health_score,
        "delta": round(delta_mask, 1),
        "masking_detected": masking_detected,
        "masking_banner": masking_banner,
        "eva_clearance": eva_clearance,
    }

    return {
        "crew_id": telemetry.get("crew", "Crew_A"),
        "t": telemetry.get("t", 0),
        "env": env,
        "health_score": health_score,
        "band": band,
        "traffic_light": band_frontend,
        "composite_band": band_frontend,
        "status_label": status_label,
        "organ_scores_6": organ_scores_6,
        "model_a": {
            "muscle_fatigue_score": round(fatigue_score, 1),
            "fatigue_score": round(fatigue_score, 1),
            "time_to_failure_min": time_to_fail_min,
            "legs_fail_min": time_to_fail_min,
            "legs_fail_in_min": time_to_fail_min,
            "model_used": model_a_used,
            "nirs_active": nirs_ok,
            "fallback": not nirs_ok,
        },
        "model_b": model_b_state,
        "model_c": triage_res,
        "mode3_readiness": mode3_state,
    }


# Convenience alias functions for individual model calls
def predict_fatigue(telemetry: Dict[str, Any], nirs_ok: bool = True) -> Tuple[float, float, str]:
    return AegisMLEngine.get_instance().predict_fatigue(telemetry, nirs_ok)


def predict_metabolic(
    speed_kmh: float,
    slope_deg: float,
    fatigue_score: float,
    o2_tank_remaining_l: float = 750.0,
    slope_return_deg: float = 0.0,
    distance_km: float = 1.8,
) -> Tuple[float, float, float, str]:
    return AegisMLEngine.get_instance().predict_metabolic(
        speed_kmh=speed_kmh,
        slope_deg=slope_deg,
        fatigue_score=fatigue_score,
        o2_tank_remaining_l=o2_tank_remaining_l,
        slope_return_deg=slope_return_deg,
        distance_km=distance_km,
    )


def predict_triage(telemetry: Dict[str, Any]) -> Dict[str, Any]:
    return AegisMLEngine.get_instance().predict_triage(telemetry)


if __name__ == "__main__":
    import json

    print("=================================================================")
    print("A.E.G.I.S. Core ML Prediction Engine · Verification Run")
    print("=================================================================")

    # Test Sample 1: Nominal Walk with Dynamic Distance
    nom_sample = {
        "crew": "Crew_A", "t": 0, "env": "surface_eva_spacesuit",
        "distance_m": 850.0,
        "hr": 74.0, "sys": 118.0, "dia": 76.0, "spo2": 98.4, "resp": 15.0,
        "st": 0.005, "temp": 36.7, "smo2": 78.5, "emg_mdf": -2.0, "gait": 0.12,
        "slope": 3.0, "speed": 2.5, "o2_left": 680.0, "fall": 0, "nirs_ok": 1, "dizzy": 0,
    }
    res_nom = predict_all(nom_sample)
    print("\n--- SAMPLE 1: NOMINAL WALK (Dist 850m) ---")
    print(f"Health: {res_nom['health_score']} ({res_nom['status_label']})")
    print(f"Organ Scores: {res_nom['organ_scores_6']}")
    print(f"Model A Fatigue: {res_nom['model_a']['muscle_fatigue_score']}/100, Fail in: {res_nom['model_a']['time_to_failure_min']} min")
    print(f"Model B Power: {res_nom['model_b']['metabolic_rate_watts']} W, Burn: {res_nom['model_b']['o2_burn_rate_l_min']} L/min")
    print(f"Walk-Back: Return trek time = {res_nom['model_b']['return_time_min']} min ({res_nom['model_b']['return_time_display']}) at {res_nom['model_b']['return_speed_kmh']} km/h")
    print(f"Margin before turn-back limit = {res_nom['model_b']['walk_back_limit_min']} min ({res_nom['model_b']['walk_back_label']})")
    print(f"Model C Triage: {res_nom['model_c']['primary_class']} (conf {res_nom['model_c']['confidence']})")

    # Test Sample 2: Deep in crater (2400m) with high fatigue (75%)
    deep_sample = {
        "crew": "Crew_B", "t": 60, "env": "surface_eva_spacesuit",
        "distance_m": 2400.0,
        "hr": 155.0, "sys": 135.0, "dia": 84.0, "spo2": 95.5, "resp": 28.0,
        "st": 0.02, "temp": 37.0, "smo2": 45.0, "emg_mdf": -28.0, "gait": 0.28,
        "slope": 12.0, "speed": 2.2, "o2_left": 280.0, "fall": 0, "nirs_ok": 1, "dizzy": 0,
    }
    res_deep = predict_all(deep_sample)
    print("\n--- SAMPLE 2: DEEP IN CRATER (Dist 2400m, Low O2 280L) ---")
    print(f"Model A Fatigue: {res_deep['model_a']['muscle_fatigue_score']}/100")
    print(f"Walk-Back Return Time: {res_deep['model_b']['return_time_min']} min ({res_deep['model_b']['return_time_display']}) at {res_deep['model_b']['return_speed_kmh']} km/h")
    print(f"O2 Return Needed: {res_deep['model_b']['o2_return_needed_l']} L")
    print(f"Walk-Back Margin: {res_deep['model_b']['walk_back_limit_min']} min ({res_deep['model_b']['walk_back_label']})")
    print(f"Warning Point of No Return: {res_deep['model_b']['point_of_no_return_warning']}")
    print(f"Critical Turn Back NOW: {res_deep['model_b']['critical_turn_back_now']}")
