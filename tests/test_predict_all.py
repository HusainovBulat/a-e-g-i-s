"""
Tests for predict_all.py (A.E.G.I.S. Core ML Prediction Engine)
NASA Space Apps Challenge 2026 · Project A.E.G.I.S.
"""

import json
from pathlib import Path
import pytest

from app.ml.predict_all import (
    predict_all,
    predict_fatigue,
    predict_metabolic,
    predict_triage,
    AegisMLEngine,
)


@pytest.fixture(scope="module")
def engine():
    return AegisMLEngine.get_instance()


def test_predict_fatigue_nominal_vs_tired():
    fresh_telemetry = {
        "calf_smo2_pct": 82.0,
        "nirs_desat_slope": 0.0,
        "semg_mdf_shift_pct": -1.0,
        "imu_gait_asymmetry": 0.05,
    }
    tired_telemetry = {
        "calf_smo2_pct": 42.0,
        "nirs_desat_slope": -2.5,
        "semg_mdf_shift_pct": -30.0,
        "imu_gait_asymmetry": 0.30,
    }
    score_fresh, fail_fresh, used_f = predict_fatigue(fresh_telemetry, nirs_ok=True)
    score_tired, fail_tired, used_t = predict_fatigue(tired_telemetry, nirs_ok=True)

    assert 0.0 <= score_fresh < score_tired <= 100.0
    assert fail_fresh > fail_tired
    assert "model_a" in used_f


def test_predict_fatigue_fallback_without_nirs():
    telemetry = {
        "semg_mdf_shift_pct": -25.0,
        "imu_gait_asymmetry": 0.28,
        "hr_bpm": 145.0,
    }
    score, fail_min, used = predict_fatigue(telemetry, nirs_ok=False)
    assert 0.0 <= score <= 100.0
    assert "fallback" in used


def test_predict_metabolic_apollo_benchmarks():
    # 0.0 deg @ 2.5 km/h, fatigue 10 -> 185 to 310 W
    w0, burn0, wb0, _ = predict_metabolic(2.5, 0.0, 10.0, o2_tank_remaining_l=650.0)
    assert 185.0 <= w0 <= 310.0

    # 10.0 deg @ 2.5 km/h, fatigue 10 -> 250 to 480 W
    w10, burn10, wb10, _ = predict_metabolic(2.5, 10.0, 10.0, o2_tank_remaining_l=650.0)
    assert 250.0 <= w10 <= 480.0

    # 18.0 deg @ 2.5 km/h, fatigue 10 -> 480 to 550 W
    w18, burn18, wb18, _ = predict_metabolic(2.5, 18.0, 10.0, o2_tank_remaining_l=650.0)
    assert 480.0 <= w18 <= 550.0

    # Monotonicity check
    assert w0 < w10 < w18
    assert burn0 < burn10 < burn18


def test_predict_triage_all_5_classes():
    # 1. Nominal
    res_nom = predict_triage({
        "hr": 74.0, "bp_sys": 118.0, "bp_dia": 76.0, "spo2": 98.4, "resp_rate": 15.0,
        "st_elevation_mv": 0.005, "temp": 36.7, "chest_pain": 0, "dizzy": 0, "short_breath": 0,
        "cold_sweat": 0, "fall_event": 0,
    })
    assert res_nom["primary_class"] == "Nominal"
    assert not res_nom["dont_give_nitro"]
    assert not res_nom["oxygen_surge"]

    # 2. Acute Coronary Ischemia + Nitroglycerin Block
    res_isch = predict_triage({
        "hr": 115.0, "bp_sys": 82.0, "bp_dia": 54.0, "spo2": 94.0, "resp_rate": 24.0,
        "st_elevation_mv": 0.310, "temp": 36.8, "chest_pain": 1, "dizzy": 1, "short_breath": 1,
        "cold_sweat": 1, "fall_event": 0,
    })
    assert res_isch["primary_class"] == "Acute Coronary Ischemia"
    assert res_isch["dont_give_nitro"] is True
    assert "DON'T GIVE NITROGLYCERIN" in res_isch["nitroglycerin_alert"]
    assert res_isch["flight_surgeons_alert"] is True

    # 3. Orthostatic Syncope (Severe hypotension, fall, dizzy)
    res_sync = predict_triage({
        "hr": 92.0, "bp_sys": 78.0, "bp_dia": 50.0, "spo2": 97.5, "resp_rate": 15.0,
        "st_elevation_mv": 0.01, "temp": 36.6, "chest_pain": 0, "dizzy": 1, "short_breath": 0,
        "cold_sweat": 1, "fall_event": 1,
    })
    assert res_sync["primary_class"] == "Orthostatic Syncope"
    assert res_sync["dont_give_nitro"] is True

    # 4. Hypercapnia CO2 (Tachypnea, elevated BP)
    res_co2 = predict_triage({
        "hr": 125.0, "bp_sys": 148.0, "bp_dia": 95.0, "spo2": 91.5, "resp_rate": 38.0,
        "st_elevation_mv": 0.02, "temp": 36.9, "chest_pain": 0, "dizzy": 1, "short_breath": 1,
        "cold_sweat": 0, "fall_event": 0,
    })
    assert res_co2["primary_class"] == "Hypercapnia CO2"
    assert res_co2["oxygen_surge"] is True

    # 5. Decompression Barotrauma (Severe hypoxemia, tachycardia)
    res_baro = predict_triage({
        "hr": 152.0, "bp_sys": 110.0, "bp_dia": 70.0, "spo2": 78.0, "resp_rate": 42.0,
        "st_elevation_mv": 0.01, "temp": 36.5, "chest_pain": 1, "dizzy": 1, "short_breath": 1,
        "cold_sweat": 1, "fall_event": 1,
    })
    assert res_baro["primary_class"] == "Decompression Barotrauma"
    assert res_baro["oxygen_surge"] is True


def test_predict_all_integration():
    sample = {
        "crew": "Crew_A",
        "t": 30,
        "env": "surface_eva_spacesuit",
        "hr": 118.0,
        "sys": 84.0,
        "dia": 52.0,
        "spo2": 93.0,
        "resp": 24.0,
        "st": 0.29,
        "temp": 36.8,
        "smo2": 50.0,
        "emg_mdf": -20.0,
        "gait": 0.22,
        "slope": 5.0,
        "speed": 2.0,
        "o2_left": 400.0,
        "fall": 0,
        "nirs_ok": 1,
        "dizzy": 1,
        "chest_pain": 1,
        "cold_sweat": 1,
        "short_breath": 1,
    }
    result = predict_all(sample)

    assert result["crew_id"] == "Crew_A"
    assert 0.0 <= result["health_score"] <= 100.0
    assert result["band"] in ("GREEN", "YELLOW", "RED")
    assert result["model_a"]["muscle_fatigue_score"] > 0
    assert result["model_b"]["metabolic_rate_watts"] > 0
    assert result["model_c"]["primary_class"] == "Acute Coronary Ischemia"
    assert result["model_c"]["dont_give_nitro"] is True


def test_all_6_scenarios_from_data():
    scenarios_path = Path(__file__).resolve().parent.parent / "data" / "scenarios.json"
    assert scenarios_path.exists()

    with open(scenarios_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for sc_name, sc_data in data["scenarios"].items():
        init_state = sc_data["initial_state"]
        res = predict_all(init_state)
        assert 0.0 <= res["health_score"] <= 100.0
        assert res["model_a"]["muscle_fatigue_score"] >= 0.0
        assert res["model_b"]["metabolic_rate_watts"] > 0.0
        assert res["model_c"]["primary_class"] in (
            "Nominal", "Acute Coronary Ischemia", "Orthostatic Syncope",
            "Hypercapnia CO2", "Decompression Barotrauma"
        )
