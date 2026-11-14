"""
Deterministic computation layer: every number shown on the phone, console and visor is
computed here, once (Master Plan §4).  No I/O, no networking — easy to unit-test.

Reuses Kostya's ``core_math`` (organ scores, masking detector, readiness, forecast,
Mode 2 hard rules) and the Model A/B/C registry.
"""

from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple

import core_math

from .data_store import DataStore
from .ml.models import ModelRegistry, finite, o2_burn_l_min

EVA_ENVS = {"surface_eva_spacesuit"}

DEFAULT_PACKET: Dict[str, Any] = {
    "env": "lunar_base_habitat", "hr": 68, "sys": 116, "dia": 74, "spo2": 99, "resp": 14, "st": 0.0,
    "temp": 36.6, "blood_sugar_mgdl": 90, "smo2": 82, "emg_mdf": 0, "gait": 0.15, "slope": 0,
    "speed": 0, "o2_left": 750, "fall": 0, "nirs_ok": 1, "dizzy": 0,
}
PACKET_NUMERIC_KEYS = [k for k in DEFAULT_PACKET if k != "env"]

# Demo defaults: how far from the habitat airlock (m) each scenario starts on the LOLA route.
SCENARIO_START_DISTANCE_M = {
    "normal_walk": 600.0, "steep_climb": 1800.0, "fall_in_crater": 2100.0,
    "chest_pain": 1200.0, "tired_says_fine": 900.0, "reset_all": 0.0,
}

QUEST_ALIASES = {
    "hydration": "hydration", "electrolyte": "hydration", "electrolytes": "hydration", "q1": "hydration",
    "compression": "compression", "myostimulation": "compression", "fes": "compression", "q2": "compression",
    "breathing": "breathing", "respiration": "breathing", "cortisol": "breathing", "q3": "breathing",
}
QUEST_INFO = {
    "hydration": "Electrolyte hydration (500 mL isotonic)",
    "compression": "Pneumatic calf compression / FES myostimulation (40 min)",
    "breathing": "Guided breathing & cortisol reset (10 min)",
}

SYMPTOM_KEYS = ("chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event")
SYMPTOM_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "chest_pain": ("chest", "pressure", "crushing", "clutch", "heart", "angina", "squeez"),
    "dizzy": ("dizzy", "dizziness", "lightheaded", "light-headed", "faint", "unconscious", "eyes", "confused", "spinning"),
    "short_breath": ("breath", "breathe", "breathing", "gasp", "air", "suffocat"),
    "cold_sweat": ("sweat", "clammy", "blue lips", "pale", "cyanos"),
    "fall_event": ("fell", "fall", "collapse", "slipped", "tremor", "spasm", "seizure"),
}


def band_from_score(score: float) -> str:
    return "green" if score >= 80 else ("amber" if score >= 60 else "red")


def mmss(minutes: Optional[float]) -> Optional[str]:
    if minutes is None:
        return None
    total = max(0, int(round(minutes * 60)))
    return f"{total // 60:02d}:{total % 60:02d}"


def _slope_per_min(samples: Deque[Tuple[float, float]], window_s: float, min_span_s: float = 4.0) -> Optional[float]:
    """Least-squares slope (units per minute) over the last ``window_s`` seconds."""
    if len(samples) < 5:
        return None
    t_end = samples[-1][0]
    pts = [(t, v) for t, v in samples if t >= t_end - window_s]
    if len(pts) < 5 or pts[-1][0] - pts[0][0] < min_span_s:
        return None
    n = len(pts)
    mt = sum(t for t, _ in pts) / n
    mv = sum(v for _, v in pts) / n
    den = sum((t - mt) ** 2 for t, _ in pts)
    if den <= 0:
        return None
    return sum((t - mt) * (v - mv) for t, v in pts) / den * 60.0


def match_symptom_keywords(transcript: str) -> Dict[str, Any]:
    """Server-side mirror of the console's voice Keyword Matcher (offline, deterministic)."""
    text = (transcript or "").lower()
    flags: Dict[str, bool] = {}
    hits: Dict[str, List[str]] = {}
    for key, words in SYMPTOM_KEYWORDS.items():
        found = [w for w in words if re.search(r"\b" + re.escape(w), text)]
        flags[key] = bool(found)
        if found:
            hits[key] = found
    return {"flags": flags, "matched_keywords": hits}


# ---------------------------------------------------------------------------
# Live per-crew telemetry state
# ---------------------------------------------------------------------------

@dataclass
class CrewTelemetry:
    crew_id: str
    packet: Dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_PACKET))
    smo2_hist: Deque[Tuple[float, float]] = field(default_factory=lambda: deque(maxlen=600))
    fatigue_hist: Deque[Tuple[float, float]] = field(default_factory=lambda: deque(maxlen=600))
    distance_m: float = 0.0
    last_t: Optional[float] = None
    packets_received: int = 0

    def reset(self, distance_m: float = 0.0) -> None:
        self.packet = dict(DEFAULT_PACKET)
        self.smo2_hist.clear()
        self.fatigue_hist.clear()
        self.distance_m = distance_m
        self.last_t = None
        self.packets_received = 0


class Engine:
    def __init__(self, store: DataStore, models: ModelRegistry) -> None:
        self.store = store
        self.models = models

    # ------------------------------------------------------------------ helpers
    def route_point(self, distance_m: float) -> Optional[Dict[str, Any]]:
        route = self.store.route_profile
        if not route:
            return None
        best = min(route, key=lambda p: abs(p["distance_m"] - distance_m))
        return {
            "distance_m": round(distance_m, 1),
            "total_m": route[-1]["distance_m"],
            "point_idx": best["point_idx"],
            "elevation_m": best["elevation_m"],
            "route_slope_deg": best["slope_deg"],
        }

    def _sliders_for_cns(self, crew_id: str, evening: Optional[Dict[str, Any]]) -> Tuple[float, float]:
        if evening:
            s = evening.get("inputs", {}).get("sliders", {})
            return float(s.get("sleep", 8)), float(s.get("mood", 8))
        latest = self.store.latest_sol(crew_id)
        return float(latest.get("subjective_sleep_slider", 8)), float(latest.get("subjective_mood_slider", 8))

    # ------------------------------------------------------------------ Mode 1
    def ingest(self, tel: CrewTelemetry, partial: Dict[str, Any], t: float) -> None:
        """Merge a (possibly partial) sensor packet into the crew's telemetry."""
        for k, v in partial.items():
            if k == "env" and isinstance(v, str):
                tel.packet["env"] = v
            elif k in PACKET_NUMERIC_KEYS and v is not None:
                try:
                    tel.packet[k] = float(v)
                except (TypeError, ValueError):
                    continue
        if "distance_m" in partial and partial["distance_m"] is not None:
            tel.distance_m = max(0.0, float(partial["distance_m"]))
        elif tel.last_t is not None and tel.packet.get("env") in EVA_ENVS:
            dt = max(0.0, min(5.0, t - tel.last_t))
            tel.distance_m += float(tel.packet.get("speed", 0)) * 1000.0 / 3600.0 * dt
        tel.last_t = t
        tel.packets_received += 1
        if tel.packet.get("nirs_ok", 1):
            tel.smo2_hist.append((t, float(tel.packet["smo2"])))

    def compute_snapshot(
        self, tel: CrewTelemetry, t: float, evening: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        p = tel.packet
        env = p.get("env", "lunar_base_habitat")
        nirs_ok = bool(p.get("nirs_ok", 1))
        plss = self.store.plss

        # ---- Model A: muscle fatigue + time to leg failure
        desat = _slope_per_min(tel.smo2_hist, 60.0) if nirs_ok else None
        desat = max(-5.0, min(0.0, desat)) if desat is not None else 0.0
        a_values = {
            "calf_smo2_pct": p["smo2"], "nirs_desat_slope": desat, "semg_mdf_shift_pct": p["emg_mdf"],
            "imu_gait_asymmetry": p["gait"], "hr_bpm": p["hr"],
        }
        fatigue, model_a_used = self.models.predict_fatigue(a_values, nirs_ok=nirs_ok)
        tel.fatigue_hist.append((t, fatigue))
        # Need >= 30 s of history: a few seconds of noise must not turn into "legs fail in 0.3 min".
        rate = _slope_per_min(tel.fatigue_hist, 300.0, min_span_s=30.0)
        if fatigue >= 90:
            legs_fail = 0.0
        elif rate is not None and rate > 0.05:
            legs_fail = min(240.0, (90.0 - fatigue) / rate)
        else:
            legs_fail = None  # stable / recovering

        # ---- Model B: metabolic rate, O2 burn, walk-back limit
        speed, slope = float(p["speed"]), float(p["slope"])
        watts, model_b_used = self.models.predict_metabolic_watts(speed, slope, fatigue)
        burn_now = o2_burn_l_min(watts, fatigue)
        o2_left = float(p["o2_left"])
        tank = float(plss.get("tank_capacity_liters", 750))
        walk_back = None
        if env in EVA_ENVS:
            reserve = float(plss.get("emergency_reserve_liters", 150))
            return_speed = max(1.2, 2.5 * (1.0 - 0.3 * fatigue / 100.0))  # tired legs walk back slower
            return_time_min = tel.distance_m / (return_speed * 1000.0 / 60.0)
            return_w, _ = self.models.predict_metabolic_watts(return_speed, 0.0, fatigue)  # downhill ≈ flat cost
            o2_return = o2_burn_l_min(return_w, fatigue) * return_time_min
            # NASA Apollo/Artemis sortie stay limit: 180 min (3.0 hours) max stay before turn-around
            minutes = max(0.0, (o2_left - reserve - o2_return) / max(burn_now, 0.1))
            warn = float(plss.get("walk_back_warning_minutes", 15))
            crit = float(plss.get("walk_back_critical_minutes", 5))
            level = "red" if minutes <= crit else ("amber" if minutes <= warn else "green")
            walk_back = {
                "minutes": round(minutes, 2),
                "display": mmss(minutes),
                "level": level,
                "label": {"red": "Turn back NOW", "amber": "Margin is short", "green": "Safe margin"}[level],
                "o2_reserve_l": reserve,
                "o2_return_l": round(o2_return, 1),
                "return_time_min": round(return_time_min, 1),
                "distance_from_base_m": round(tel.distance_m, 1),
            }

        # ---- 6 organ zones (core_math, environment-shift aware)
        sleep_s, mood_s = self._sliders_for_cns(tel.crew_id, evening)
        organ = core_math.calculate_organ_scores(
            {**p, "sleep_score": sleep_s, "mood_score": mood_s}, env
        )
        organ_scores = {
            k: {"name": z["name"], "score": z["score"], "band": band_from_score(z["score"]), "key_metrics": z["key_metrics"]}
            for k, z in organ["organ_zones"].items()
        }

        # ---- alerts + traffic light
        alerts = self.vital_alerts(p)
        if fatigue >= 70:
            alerts.append({"level": "amber", "code": "muscle_fatigue", "text": f"Leg fatigue {fatigue:.0f}/100"})
        if walk_back and walk_back["level"] != "green":
            alerts.append({"level": walk_back["level"], "code": "walk_back",
                           "text": f"Walk-back limit {walk_back['display']} — {walk_back['label']}"})
        composite = organ["composite_health_score"]
        levels = [a["level"] for a in alerts] + [band_from_score(composite)]
        if fatigue >= 85:
            levels.append("red")
        elif fatigue >= 60:
            levels.append("amber")
        light = "red" if "red" in levels else ("amber" if "amber" in levels else "green")

        visor = self.visor_line(light, walk_back, fatigue, slope, p)
        return {
            "crew": tel.crew_id,
            "t": round(t, 3),
            "env": env,
            "environment": organ["environment"],
            "vitals": {k: p[k] for k in PACKET_NUMERIC_KEYS},
            "organ_scores": organ_scores,
            "composite_score": composite,
            "composite_band": band_from_score(composite),
            "model_a": {
                "fatigue_score": round(fatigue, 1),
                "fatigue_rate_per_min": round(rate, 2) if rate is not None else None,
                "legs_fail_in_min": round(legs_fail, 1) if legs_fail is not None else None,
                "calf_smo2_pct": p["smo2"],
                "nirs_desat_slope": round(desat, 2),
                "semg_mdf_shift_pct": p["emg_mdf"],
                "gait_wobble": p["gait"],
                "nirs_fogged": not nirs_ok,
                "model": model_a_used,
            },
            "model_b": {
                "metabolic_rate_watts": round(finite(watts), 1),
                "o2_burn_rate_l_min": round(finite(burn_now), 2),
                "o2_left_l": round(o2_left, 1),
                "o2_left_pct": round(100.0 * o2_left / tank, 1) if tank else None,
                "slope_deg": slope,
                "speed_kmh": speed,
                "model": model_b_used,
            },
            "walk_back": walk_back,
            "route_position": self.route_point(tel.distance_m) if env in EVA_ENVS else None,
            "traffic_light": light,
            "alerts": alerts,
            "visor": visor,
        }

    def vital_alerts(self, p: Dict[str, Any]) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []
        if p.get("fall"):
            alerts.append({"level": "red", "code": "fall", "text": "Fall detected"})
        if p["sys"] < 90:
            alerts.append({"level": "red", "code": "hypotension", "text": f"BP {p['sys']:.0f}/{p['dia']:.0f} < 90 mmHg"})
        if p["spo2"] < 92:
            alerts.append({"level": "red", "code": "hypoxemia", "text": f"SpO2 {p['spo2']:.1f}% < 92%"})
        st_mv = p["st"] / 10.0 if abs(p["st"]) > 0.5 else p["st"]
        if st_mv >= 0.1:
            alerts.append({"level": "red", "code": "st_elevation", "text": f"ST elevation {st_mv:.2f} mV"})
        if p.get("dizzy"):
            alerts.append({"level": "amber", "code": "dizzy", "text": "Crew reports dizziness"})
        if p["hr"] > 135 or p["hr"] < 45:
            alerts.append({"level": "amber", "code": "heart_rate", "text": f"HR {p['hr']:.0f} bpm"})
        bs = p["blood_sugar_mgdl"]
        if bs < 60 or bs > 180:
            alerts.append({"level": "red", "code": "blood_sugar", "text": f"Blood sugar {bs:.0f} mg/dL"})
        if p["temp"] < 35.0 or p["temp"] > 38.5:
            alerts.append({"level": "red", "code": "temperature", "text": f"Body temp {p['temp']:.1f} °C"})
        return alerts

    @staticmethod
    def emergency_reasons(p: Dict[str, Any]) -> List[str]:
        """Conditions that make the console auto-jump to Mode 2."""
        reasons = []
        st_mv = p["st"] / 10.0 if abs(p["st"]) > 0.5 else p["st"]
        if p.get("fall"):
            reasons.append("fall")
        if st_mv >= 0.1:
            reasons.append("st_elevation")
        if p["sys"] < 90:
            reasons.append("hypotension")
        if p["spo2"] < 92:
            reasons.append("hypoxemia")
        return reasons

    @staticmethod
    def visor_line(light: str, walk_back: Optional[Dict[str, Any]], fatigue: float, slope: float,
                   p: Dict[str, Any]) -> Dict[str, Any]:
        icon = {"green": "🟢", "amber": "🟡", "red": "🔴"}[light]
        if p.get("fall") or p["sys"] < 90 or p["spo2"] < 92:
            instruction = "SOS · HOLD POSITION"
        elif walk_back and walk_back["level"] == "red":
            instruction = "TURN BACK NOW"
        elif walk_back and walk_back["level"] == "amber":
            instruction = "START WALK-BACK"
        elif fatigue >= 70 and slope >= 10:
            instruction = "STOP 60 S, THEN CLIMB 30% SLOWER"
        elif fatigue >= 70:
            instruction = "STOP 60 S"
        elif fatigue >= 60:
            instruction = "SLOW PACE"
        else:
            instruction = "NOMINAL"
        timer = walk_back["display"] if walk_back else None
        parts = [f"{icon}"] + ([timer] if timer else []) + [instruction]
        return {
            "light": light,
            "timer": timer,
            "instruction": instruction,
            "line": " ".join(parts[:2]) + (" · " + " · ".join(parts[2:]) if len(parts) > 2 else ""),
            "dim_non_essential": bool(p.get("dizzy")),
        }

    # ------------------------------------------------------------------ Mode 2
    def triage(
        self,
        vitals: Dict[str, Any],
        symptoms: Dict[str, bool],
        ultrasound_attached: bool = False,
        readiness: Optional[float] = None,
    ) -> Dict[str, Any]:
        sys_bp = float(vitals.get("sys", vitals.get("bp_sys", 120)))
        dia_bp = float(vitals.get("dia", vitals.get("bp_dia", 80)))
        spo2 = float(vitals.get("spo2", 98))
        st_raw = float(vitals.get("st", vitals.get("st_elevation_mv", 0.0)))
        st_mv = st_raw / 10.0 if abs(st_raw) > 0.5 else st_raw
        features = {
            "hr": float(vitals.get("hr", 75)), "bp_sys": sys_bp, "bp_dia": dia_bp, "spo2": spo2,
            "resp_rate": float(vitals.get("resp", vitals.get("resp_rate", 15))),
            "st_elevation_mv": st_mv, "temp": float(vitals.get("temp", 36.7)),
            **{k: 1.0 if symptoms.get(k) else 0.0 for k in SYMPTOM_KEYS},
        }
        tree = self.models.triage(features)
        primary = tree["primary_class"]

        # Hard clinical rules (core_math) ALWAYS run after the tree and override it.
        safety = core_math.apply_mode2_safety_rules(primary, {**vitals, "sys": sys_bp, "dia": dia_bp, "spo2": spo2})
        interlocks = safety["critical_interlocks"]
        steps = [dict(s) for s in safety["first_aid_protocol"]["steps"]]
        if interlocks["trigger_o2_surge"]:  # Rule 2: SpO2 < 92 -> O2 mask becomes Step 1
            steps.insert(0, {
                "title": "Apply 100% O₂ mask at 4 L/min",
                "action": f"SpO2 {spo2:.0f}% < 92%. Fit the oxygen mask from the medical bay before anything else.",
                "status": "active",
            })
        for i, s in enumerate(steps, start=1):
            s["step"] = i

        dont_give: List[Dict[str, Any]] = []
        if interlocks["dont_give_nitro"]:  # Rule 1: systolic < 90 -> nitroglycerin hard-block
            dont_give.append({
                "drug": "Nitroglycerin",
                "reason": f"BP {sys_bp:.0f}/{dia_bp:.0f} < 90 mmHg",
                "banner": f"⛔ DON'T GIVE NITROGLYCERIN (BP {sys_bp:.0f}/{dia_bp:.0f} < 90 mmHg)",
                "spoken": "Do not give nitroglycerin. Blood pressure is too low.",
            })

        # Rule 3: ischemia or readiness < 50 -> escalate to flight surgeons on Earth.
        fs_reasons = []
        if primary == "Acute Coronary Ischemia":
            fs_reasons.append("Primary class is Acute Coronary Ischemia")
        if readiness is not None and readiness < 50:
            fs_reasons.append(f"Readiness {readiness:.0f} < 50")
        flight_surgeons = bool(fs_reasons)

        warnings = [w for w in (interlocks.get("nitro_contraindication_banner"), interlocks.get("o2_alert"),
                                interlocks.get("co2_alert")) if w]
        return {
            "primary_class": primary,
            "confidence": tree["confidence"],
            "ranked_other_classes": tree["ranked"][1:],
            "tree_path_why": tree["tree_path"],
            "dont_give_list": dont_give,
            "protocol_name": safety["first_aid_protocol"]["protocol_name"],
            "protocol_steps": steps,
            "interlocks": interlocks,
            "warnings": warnings,
            "flight_surgeons_queued": flight_surgeons,
            "flight_surgeons_reasons": fs_reasons,
            "flight_surgeons_badge": "📡 Queued for Flight Surgeons on Earth" if flight_surgeons else None,
            "ultrasound_attached": bool(ultrasound_attached),
            "symptom_flags": {k: bool(symptoms.get(k)) for k in SYMPTOM_KEYS},
            "vitals_used": {"hr": features["hr"], "sys": sys_bp, "dia": dia_bp, "spo2": spo2,
                            "resp": features["resp_rate"], "st_mv": round(st_mv, 3), "temp": features["temp"]},
            "spoken_text": self._spoken(primary, dont_give, steps),
            "model": tree["model"],
        }

    @staticmethod
    def _spoken(primary: str, dont_give: List[Dict[str, Any]], steps: List[Dict[str, Any]]) -> str:
        parts = [f"Suspected {primary}."]
        parts += [d["spoken"] for d in dont_give]
        parts += [f"Step {s['step']}: {s['title']}." for s in steps]
        return " ".join(parts)

    # ------------------------------------------------------------------ Mode 3
    def evening(
        self,
        crew_id: str,
        sliders: Dict[str, float],
        blood_sugar: Optional[float],
        bp_sys: Optional[float],
        bp_dia: Optional[float],
        temp: Optional[float],
        completed_quests: List[str],
        live: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        latest = self.store.latest_sol(crew_id)
        record = self.store.crew_record(crew_id) or {}
        blood_sugar = float(blood_sugar if blood_sugar is not None else latest.get("blood_sugar_mgdl", 95))
        temp = float(temp if temp is not None else latest.get("body_temp_c", 36.7))
        bp_sys = float(bp_sys if bp_sys is not None else 118)
        bp_dia = float(bp_dia if bp_dia is not None else 76)
        quests = sorted({QUEST_ALIASES[q.lower()] for q in completed_quests if q.lower() in QUEST_ALIASES})

        # ---- objective score: day-hike telemetry (OSDR table D) + today's live Model A
        objective_base = float(latest.get("objective_sensor_score", 80.0))
        live_fatigue = live["model_a"]["fatigue_score"] if live and live.get("model_a") else None
        live_gait = float(live["vitals"]["gait"]) if live else 0.0
        objective = objective_base if live_fatigue is None else min(objective_base, 100.0 - live_fatigue)
        penalties: Dict[str, float] = {}
        if blood_sugar < 60 or blood_sugar > 180:
            penalties["blood_sugar"] = 20.0
        elif blood_sugar < 75 or blood_sugar > 115:
            penalties["blood_sugar"] = round(min(15.0, 0.3 * (75 - blood_sugar if blood_sugar < 75 else blood_sugar - 115)), 1)
        if bp_sys < 90:
            penalties["blood_pressure"] = 20.0
        elif bp_sys < 95 or bp_sys > 135:
            penalties["blood_pressure"] = 10.0
        if temp < 35.0 or temp > 38.5:
            penalties["temperature"] = 20.0
        elif temp < 36.3 or temp > 37.2:
            penalties["temperature"] = 8.0
        objective_score = core_math.clamp(objective - sum(penalties.values()), 0.0, 100.0)

        fatigue_for_mismatch = live_fatigue if live_fatigue is not None else 100.0 - objective_base
        masking = core_math.detect_masking(
            sliders, objective_score,
            vitals={"muscle_fatigue_score": fatigue_for_mismatch, "gait_tremor_sd": live_gait},
        )
        is_masking = masking["masking_detected"]
        readiness = core_math.calculate_eva_readiness_score(objective_score, quests, is_masking=is_masking)
        band = {"CLEARED": "green", "CAUTION": "amber", "PROHIBITED": "red"}[readiness["eva_status"]]

        all_quests = list(core_math.QUEST_BONUSES)
        forecast = core_math.simulate_eva_consequences(objective_score, all_quests, is_masking=is_masking)
        labels = forecast["chart_data"]["labels"]
        minutes = [int(l.rstrip("m")) for l in labels]
        no_rest, with_quests = (ds["data"] for ds in forecast["chart_data"]["datasets"])

        organ_vitals = {
            "hr": live["vitals"]["hr"] if live else latest.get("resting_hr_bpm", 70),
            "spo2": live["vitals"]["spo2"] if live else 98.0,
            "resp": live["vitals"]["resp"] if live else 15.0,
            "st": live["vitals"]["st"] if live else 0.0,
            "smo2": live["vitals"]["smo2"] if live else latest.get("calf_smo2_pct", 78),
            "gait": live_gait if live else 0.3,
            "sys": bp_sys, "dia": bp_dia, "temp": temp, "blood_sugar_mgdl": blood_sugar,
            "sleep_score": sliders.get("sleep", 8), "mood_score": sliders.get("mood", 8),
        }
        env = live["env"] if live else "lunar_base_habitat"
        organ = core_math.calculate_organ_scores(organ_vitals, env)
        organ_scores = {
            k: {"name": z["name"], "score": z["score"], "band": band_from_score(z["score"])}
            for k, z in organ["organ_zones"].items()
        }

        quest_cards = []
        for q in all_quests:
            done = q in quests
            quest_cards.append({
                "id": q, "title": QUEST_INFO[q], "bonus": core_math.QUEST_BONUSES[q], "completed": done,
            })
        projected_all = core_math.calculate_eva_readiness_score(objective_score, all_quests, is_masking=is_masking)

        mismatch_text = None
        if is_masking:
            mismatch_text = (
                f"🟡 Mismatch Detected: self-reported energy {sliders.get('energy', 0):.0f}/10 "
                f"but objective score is {objective_score:.0f}/100. {masking['reason']}"
            )
        sol = int(latest.get("sol", record.get("current_sol", 1)))
        return {
            "crew": crew_id,
            "crew_id": crew_id,
            "crew_name": f"{record.get('name', crew_id)} ({record.get('role', 'Crew')})",
            "sol": sol,
            "readiness_score": readiness["readiness_score"],
            "band": band,
            "eva_status": readiness["eva_status"],
            "badge_text": readiness["badge_text"],
            "readiness_if_all_quests": projected_all["readiness_score"],
            "mismatch_detected": is_masking,
            "masking_detected": is_masking,
            "mismatch_text": mismatch_text,
            "subjective_score": masking["subjective_score"],
            "subjective_energy_slider": float(sliders.get("energy", 0)),
            "objective_score": round(objective_score, 1),
            "objective_breakdown": {
                "osdr_day_telemetry_score": objective_base,
                "live_model_a_fatigue": live_fatigue,
                "vital_penalties": penalties,
            },
            "delta": masking["delta"],
            "escalation_level": masking["escalation_level"],
            "quests": quest_cards,
            "completed_quests": {q: q in quests for q in all_quests},
            "forecast_minutes": minutes,
            "forecast_curve_no_rest": no_rest,
            "forecast_curve_with_quests": with_quests,
            "forecast_failure_minute": forecast["failure_minute"],
            "organ_scores_6": organ_scores,
            "flight_surgeons_alert": readiness["readiness_score"] < 50,
            "vitals": {
                "calf_smo2_pct": organ_vitals["smo2"],
                "cum_bone_load_g": latest.get("cum_bone_load_g"),
                "sleep_hours": latest.get("sleep_hours"),
                "bp_sys": bp_sys,
                "bp_dia": bp_dia,
                "resting_hr_bpm": latest.get("resting_hr_bpm"),
                "blood_sugar_mgdl": blood_sugar,
                "body_temp_c": temp,
            },
            "inputs": {"sliders": sliders, "completed_quests": quests},
        }

    def best_replacement(self, exclude: str) -> Optional[Dict[str, Any]]:
        best = None
        for cid, rec in (self.store.crew_history.get("crew") or {}).items():
            if cid == exclude:
                continue
            score = float((rec.get("history") or [{}])[-1].get("objective_sensor_score", 0))
            if best is None or score > best["objective_score"]:
                best = {"crew": cid, "name": rec.get("name"), "role": rec.get("role"), "objective_score": score}
        return best
