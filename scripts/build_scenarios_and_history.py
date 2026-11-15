"""
PROJECT A.E.G.I.S. (v4.0) — Generation Script for crew_history.json & scenarios.json
NASA Space Apps Challenge 2026

Generates:
1. data/crew_history.json:
   - 14 sols × 4 astronauts (Crew_A..D)
   - Calibrated from NASA OSDR OSD-783 and OSD-435 via table_d_osdr_14day_trend.csv
   - Used by Bulat's GET /crew/{id}/history for Mode 3 14-day trend charts and body map

2. data/scenarios.json:
   - 6 scenarios for phone simulator (accessible via QR code):
     1. Normal walk (Nominal crater traverse)
     2. Steep climb (+18° LRO LOLA ascent, muscle fatigue surge, 15-min walk-back warning)
     3. Fall in crater (fall=1, 30-sec forearm cuff cancellation countdown)
     4. Chest pain (Acute Coronary Ischemia, ST elevation +0.286 mV, BP 82/54 < 90, nitro-block)
     5. Tired, says fine (Subjective energy 9.1 vs objective fatigue 42.1, delta 49.9 pts)
     6. Reset all (Restores nominal 1g/base baseline)
   - Each scenario has a complete 60-second time-series (1 Hz) matching Rule 1.3 schema.
"""

import os
import json
import csv
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TABLE_D_FILE = os.path.join(DATA_DIR, "table_d_osdr_14day_trend.csv")
CREW_HISTORY_FILE = os.path.join(DATA_DIR, "crew_history.json")
SCENARIOS_FILE = os.path.join(DATA_DIR, "scenarios.json")


def generate_crew_history():
    print("--- [1/2] Generating crew_history.json from table_d_osdr_14day_trend.csv ---")
    if not os.path.exists(TABLE_D_FILE):
        raise FileNotFoundError(f"Missing {TABLE_D_FILE}")

    crew_data = {
        "Crew_A": {
            "id": "Crew_A",
            "name": "Astronaut A",
            "role": "EVA Specialist",
            "assignment": "Primary Lunar Surface Sortie Operator",
            "status_band": "caution",
            "current_sol": 14,
            "history": []
        },
        "Crew_B": {
            "id": "Crew_B",
            "name": "Astronaut B",
            "role": "Systems Engineer",
            "assignment": "Backup EVA Operator & Habitat ECLSS Specialist",
            "status_band": "nominal",
            "current_sol": 14,
            "history": []
        },
        "Crew_C": {
            "id": "Crew_C",
            "name": "Astronaut C",
            "role": "Flight Surgeon",
            "assignment": "Medical Officer & Telemedicine Lead",
            "status_band": "nominal",
            "current_sol": 14,
            "history": []
        },
        "Crew_D": {
            "id": "Crew_D",
            "name": "Astronaut D",
            "role": "Geology Specialist",
            "assignment": "Field Sampling & Drill Rig Operator",
            "status_band": "nominal",
            "current_sol": 14,
            "history": []
        }
    }

    with open(TABLE_D_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row["crew_id"]
            if cid in crew_data:
                sol_entry = {
                    "sol": int(row["sol"]),
                    "is_eva_day": bool(int(row["is_eva_day"])),
                    # Objective telemetry from smart base-layer (NASA OSDR OSD-783 / OSD-435)
                    "calf_smo2_pct": round(float(row["calf_smo2_pct"]), 1),
                    "cum_bone_load_g": round(float(row["cum_bone_load_g"]), 1),
                    "sleep_hours": round(float(row["sleep_hours"]), 1),
                    "blood_sugar_mgdl": round(float(row["blood_sugar_mgdl"]), 1),
                    "resting_hr_bpm": round(float(row["resting_hr_bpm"]), 1),
                    "body_temp_c": round(float(row["body_temp_c"]), 2),
                    "objective_sensor_score": round(float(row["objective_sensor_score"]), 1),
                    # Subjective check-in sliders
                    "subjective_energy_slider": round(float(row["subjective_energy_slider"]), 1),
                    "subjective_sleep_slider": round(float(row["subjective_sleep_slider"]), 1),
                    "subjective_mood_slider": round(float(row["subjective_mood_slider"]), 1),
                    "subjective_pain_free_slider": round(float(row["subjective_pain_free_slider"]), 1),
                    "subjective_nutrition_slider": round(float(row["subjective_nutrition_slider"]), 1),
                    # Calculated flags
                    "mismatch_detected": bool(int(row["mismatch_detected"])),
                    "masking_detected": bool(int(row["mismatch_detected"]))
                }
                crew_data[cid]["history"].append(sol_entry)

    # Sort each crew's history by sol
    for cid in crew_data:
        crew_data[cid]["history"].sort(key=lambda x: x["sol"])

    payload = {
        "metadata": {
            "source": "NASA OSDR OSD-783 & OSD-435 / Project A.E.G.I.S.",
            "duration_sols": 14,
            "total_crew": 4,
            "description": "14-day longitudinal trends of calf muscle oxygenation, cumulative axial bone load, circadian sleep, and glucose"
        },
        "crew": crew_data,
        # Direct top-level access aliases for Bulat: payload["Crew_A"], etc.
        "Crew_A": crew_data["Crew_A"],
        "Crew_B": crew_data["Crew_B"],
        "Crew_C": crew_data["Crew_C"],
        "Crew_D": crew_data["Crew_D"]
    }

    with open(CREW_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved crew_history.json: {len(crew_data)} crew members × 14 sols = 56 entries.")


def generate_scenarios():
    print("--- [2/2] Generating scenarios.json (6 scenarios × 60-second 1Hz streams) ---")
    np.random.seed(42)

    # Helper function to generate 60-second realistic time series
    def make_timeline(base_dict, trend_dict=None, noise_dict=None):
        timeline = []
        trend_dict = trend_dict or {}
        noise_dict = noise_dict or {}

        for sec in range(60):
            t_ratio = sec / 59.0
            packet = {
                "crew": "Crew_A",
                "t": sec,
                "env": base_dict.get("env", "surface_eva_spacesuit"),
                "hr": round(base_dict["hr"] + trend_dict.get("hr", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("hr", 0.8)), 1),
                "sys": round(base_dict["sys"] + trend_dict.get("sys", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("sys", 0.7)), 1),
                "dia": round(base_dict["dia"] + trend_dict.get("dia", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("dia", 0.5)), 1),
                "spo2": round(base_dict["spo2"] + trend_dict.get("spo2", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("spo2", 0.2)), 1),
                "resp": round(base_dict["resp"] + trend_dict.get("resp", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("resp", 0.4)), 1),
                "st": round(base_dict["st"] + trend_dict.get("st", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("st", 0.003)), 3),
                "temp": round(base_dict["temp"] + trend_dict.get("temp", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("temp", 0.02)), 2),
                "blood_sugar_mgdl": round(base_dict["blood_sugar_mgdl"] + trend_dict.get("blood_sugar_mgdl", 0.0) * t_ratio, 1),
                "smo2": round(base_dict["smo2"] + trend_dict.get("smo2", 0.0) * t_ratio + np.random.normal(0, noise_dict.get("smo2", 0.5)), 1),
                "emg_mdf": round(base_dict["emg_mdf"] + trend_dict.get("emg_mdf", 0.0) * t_ratio, 1),
                "gait": round(base_dict["gait"] + trend_dict.get("gait", 0.0) * t_ratio + abs(np.random.normal(0, noise_dict.get("gait", 0.02))), 2),
                "slope": round(base_dict["slope"] + trend_dict.get("slope", 0.0) * t_ratio, 1),
                "speed": round(base_dict["speed"] + trend_dict.get("speed", 0.0) * t_ratio, 1),
                "o2_left": round(base_dict["o2_left"] - (base_dict.get("burn_rate", 1.8) / 60.0) * sec, 1),
                "fall": int(base_dict.get("fall", 0)),
                "nirs_ok": int(base_dict.get("nirs_ok", 1)),
                "dizzy": int(base_dict.get("dizzy", 0))
            }
            # Clamping to valid physiological limits
            packet["spo2"] = max(70.0, min(100.0, packet["spo2"]))
            packet["smo2"] = max(10.0, min(100.0, packet["smo2"]))
            timeline.append(packet)
        return timeline

    scenarios = {
        # 1. NORMAL WALK
        "normal_walk": {
            "id": "normal_walk",
            "name": "Normal Surface Walk",
            "badge": "🟢 NOMINAL",
            "badge_color": "#10B981",
            "description": "Nominal EVA traverse on flat regolith (slope 2°-4°). Stable vitals, optimal muscle oxygenation (SmO2 78%), and nominal O2 consumption.",
            "mode_target": "Mode 1 (EVA)",
            "initial_state": {
                "hr": 74.0, "sys": 118.0, "dia": 76.0, "spo2": 98.4, "resp": 15.0,
                "st": 0.005, "temp": 36.7, "blood_sugar_mgdl": 92.0, "smo2": 78.5,
                "emg_mdf": -2.0, "gait": 0.22, "slope": 3.0, "speed": 2.5, "o2_left": 680.0,
                "fall": 0, "nirs_ok": 1, "dizzy": 0
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 74.0, "sys": 118.0, "dia": 76.0, "spo2": 98.4, "resp": 15.0, "st": 0.005, "temp": 36.7, "blood_sugar_mgdl": 92.0, "smo2": 78.5, "emg_mdf": -2.0, "gait": 0.22, "slope": 3.0, "speed": 2.5, "o2_left": 680.0, "burn_rate": 1.2, "fall": 0, "nirs_ok": 1, "dizzy": 0},
                trend_dict={"hr": 4.0, "smo2": -2.0, "slope": 1.0},
                noise_dict={"hr": 0.5, "smo2": 0.4}
            )
        },

        # 2. STEEP CLIMB
        "steep_climb": {
            "id": "steep_climb",
            "name": "Steep Crater Climb (LRO LOLA +18°)",
            "badge": "🟡 CAUTION: HIGH EXERTION",
            "badge_color": "#F59E0B",
            "description": "Ascending steep crater rim (+18° slope). Muscle SmO2 drops rapidly toward 42%, metabolic rate spikes to 510W, walk-back limit approached (04:52 warning).",
            "mode_target": "Mode 1 (EVA Early Warning)",
            "initial_state": {
                "hr": 128.0, "sys": 138.0, "dia": 86.0, "spo2": 95.8, "resp": 26.0,
                "st": 0.015, "temp": 37.1, "blood_sugar_mgdl": 105.0, "smo2": 52.0,
                "emg_mdf": -24.0, "gait": 0.65, "slope": 18.5, "speed": 1.8, "o2_left": 310.0,
                "fall": 0, "nirs_ok": 1, "dizzy": 0
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 128.0, "sys": 138.0, "dia": 86.0, "spo2": 95.8, "resp": 26.0, "st": 0.015, "temp": 37.1, "blood_sugar_mgdl": 105.0, "smo2": 52.0, "emg_mdf": -24.0, "gait": 0.65, "slope": 18.5, "speed": 1.8, "o2_left": 310.0, "burn_rate": 2.2, "fall": 0, "nirs_ok": 1, "dizzy": 0},
                trend_dict={"hr": 18.0, "smo2": -14.0, "emg_mdf": -8.0, "gait": 0.25, "resp": 4.0},
                noise_dict={"hr": 1.2, "smo2": 0.8}
            )
        },

        # 3. FALL IN CRATER
        "fall_in_crater": {
            "id": "fall_in_crater",
            "name": "Fall in Crater (Loss of Balance)",
            "badge": "🔴 EMERGENCY: CREW FALL",
            "badge_color": "#EF4444",
            "description": "Astronaut slips on loose rim scree (fall=1). Automatically activates suit 100% O2 blast, emergency heating, and 30-second cancellation countdown on forearm cuff.",
            "mode_target": "Mode 2 / Visor Popup",
            "initial_state": {
                "hr": 142.0, "sys": 145.0, "dia": 92.0, "spo2": 93.5, "resp": 31.0,
                "st": 0.012, "temp": 36.5, "blood_sugar_mgdl": 98.0, "smo2": 44.0,
                "emg_mdf": -18.0, "gait": 1.45, "slope": 21.0, "speed": 0.0, "o2_left": 420.0,
                "fall": 1, "nirs_ok": 1, "dizzy": 1
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 142.0, "sys": 145.0, "dia": 92.0, "spo2": 93.5, "resp": 31.0, "st": 0.012, "temp": 36.5, "blood_sugar_mgdl": 98.0, "smo2": 44.0, "emg_mdf": -18.0, "gait": 1.45, "slope": 21.0, "speed": 0.0, "o2_left": 420.0, "burn_rate": 1.6, "fall": 1, "nirs_ok": 1, "dizzy": 1},
                trend_dict={"hr": -12.0, "resp": -5.0},
                noise_dict={"hr": 2.0}
            )
        },

        # 4. CHEST PAIN (ACUTE ISCHEMIA + NITRO BLOCK)
        "chest_pain": {
            "id": "chest_pain",
            "name": "Acute Chest Pain (Suspected Ischemia)",
            "badge": "🔴 EMERGENCY: CODE RED",
            "badge_color": "#EF4444",
            "description": "Sudden crushing retrosternal chest pain. Significant ECG ST-elevation (+0.286 mV), cardiogenic hypotension (82/54 mmHg). AUTO-JUMPS to Mode 2. HARD-BLOCKS Nitroglycerin! Deploys AED protocol.",
            "mode_target": "Mode 2 (Emergency Triage)",
            "initial_state": {
                "hr": 118.0, "sys": 82.0, "dia": 54.0, "spo2": 94.5, "resp": 24.0,
                "st": 0.286, "temp": 36.8, "blood_sugar_mgdl": 104.0, "smo2": 62.0,
                "emg_mdf": -5.0, "gait": 0.35, "slope": 4.0, "speed": 0.5, "o2_left": 550.0,
                "fall": 0, "nirs_ok": 1, "dizzy": 1
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 118.0, "sys": 82.0, "dia": 54.0, "spo2": 94.5, "resp": 24.0, "st": 0.286, "temp": 36.8, "blood_sugar_mgdl": 104.0, "smo2": 62.0, "emg_mdf": -5.0, "gait": 0.35, "slope": 4.0, "speed": 0.5, "o2_left": 550.0, "burn_rate": 1.5, "fall": 0, "nirs_ok": 1, "dizzy": 1},
                trend_dict={"hr": 6.0, "sys": -4.0, "dia": -3.0, "st": 0.04},
                noise_dict={"hr": 1.5, "sys": 1.0}
            )
        },

        # 5. TIRED, SAYS FINE (MASKING DETECTED)
        "tired_says_fine": {
            "id": "tired_says_fine",
            "name": "Tired, Says Fine (Masking Detected)",
            "badge": "🟡 CAUTION: MASKING DETECTED",
            "badge_color": "#F59E0B",
            "description": "Astronaut underreports fatigue (energy slider 9.1/10) while biometric telemetry detects muscle exhaustion (SmO2 48%, gait tremor +2.3 SD). Triggers Mismatch Detected banner and revokes auto-clearance.",
            "mode_target": "Mode 3 (Evening Check-in)",
            "initial_state": {
                "hr": 84.0, "sys": 122.0, "dia": 78.0, "spo2": 97.5, "resp": 17.0,
                "st": 0.008, "temp": 36.9, "blood_sugar_mgdl": 108.6, "smo2": 48.0,
                "emg_mdf": -34.0, "gait": 0.88, "slope": 5.0, "speed": 2.0, "o2_left": 610.0,
                "fall": 0, "nirs_ok": 1, "dizzy": 0
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 84.0, "sys": 122.0, "dia": 78.0, "spo2": 97.5, "resp": 17.0, "st": 0.008, "temp": 36.9, "blood_sugar_mgdl": 108.6, "smo2": 48.0, "emg_mdf": -34.0, "gait": 0.88, "slope": 5.0, "speed": 2.0, "o2_left": 610.0, "burn_rate": 1.4, "fall": 0, "nirs_ok": 1, "dizzy": 0},
                trend_dict={"gait": 0.1, "smo2": -3.0},
                noise_dict={"hr": 0.8}
            )
        },

        # 6. RESET ALL
        "reset_all": {
            "id": "reset_all",
            "name": "Reset to Nominal Baseline",
            "badge": "🟢 NOMINAL RESTORED",
            "badge_color": "#10B981",
            "description": "Restores nominal resting state across all 4 crew members, resets alarms, clears emergency flags, and returns to baseline mission parameters.",
            "mode_target": "Mode 0 (Overview / Top Bar)",
            "initial_state": {
                "hr": 68.0, "sys": 116.0, "dia": 74.0, "spo2": 99.0, "resp": 14.0,
                "st": 0.0, "temp": 36.6, "blood_sugar_mgdl": 90.0, "smo2": 82.0,
                "emg_mdf": 0.0, "gait": 0.15, "slope": 0.0, "speed": 0.0, "o2_left": 750.0,
                "fall": 0, "nirs_ok": 1, "dizzy": 0
            },
            "timeline_60s": make_timeline(
                base_dict={"hr": 68.0, "sys": 116.0, "dia": 74.0, "spo2": 99.0, "resp": 14.0, "st": 0.0, "temp": 36.6, "blood_sugar_mgdl": 90.0, "smo2": 82.0, "emg_mdf": 0.0, "gait": 0.15, "slope": 0.0, "speed": 0.0, "o2_left": 750.0, "burn_rate": 0.8, "fall": 0, "nirs_ok": 1, "dizzy": 0},
                trend_dict={},
                noise_dict={"hr": 0.4}
            )
        }
    }

    payload = {
        "metadata": {
            "project": "A.E.G.I.S. v4.0",
            "version": "1.0.0",
            "stream_rate_hz": 1,
            "scenario_duration_seconds": 60,
            "description": "6 interactive demonstration scenarios for Phone Sensor Simulator (accessible via QR code). Live 60-second telemetry streams matching Rule 1.3 schema."
        },
        "scenarios": scenarios
    }

    with open(SCENARIOS_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved scenarios.json: 6 scenarios with 60-second 1Hz telemetry timelines.")


if __name__ == "__main__":
    generate_crew_history()
    generate_scenarios()
    print("\n=====================================================================")
    print("ALL DATASETS AND ARTIFACTS COMPLETE!")
    print("=====================================================================")
