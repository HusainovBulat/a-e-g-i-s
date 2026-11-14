"""
Comprehensive Real-Data Verification Test Suite for Project A.E.G.I.S. Models
NASA Space Apps Challenge 2026 · Autonomous EVA Gait, Ischemia & Survival System

Validates Model A, Model B, Model C, and Master Pipeline against real datasets:
- PhysioNet SEMG & Figshare PLOS ONE (table_a_myo_fatigue.csv)
- NASA LRO LOLA Shackleton Rim Topography & Apollo Benchmarks (table_b_lunar_eva_metabolic.csv & route_profile.json)
- PhysioNet BIDMC ICU & PhysioNet Pulse Transit Time (table_c_emergency_triage.csv)
- NASA OSDR OSD-783 & OSD-435 14-Day Trajectories (table_d_osdr_14day_trend.csv & crew_history.json)
- NASA 60-Second Real EVA Mission Scenarios (scenarios.json)
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from predict_all import (
    predict_all,
    predict_fatigue,
    predict_metabolic,
    predict_triage,
    AegisMLEngine,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"


@pytest.fixture(scope="module")
def df_table_a():
    csv_path = DATA_DIR / "table_a_myo_fatigue.csv"
    assert csv_path.exists(), f"Missing dataset: {csv_path}"
    return pd.read_csv(csv_path)


@pytest.fixture(scope="module")
def df_table_b():
    csv_path = DATA_DIR / "table_b_lunar_eva_metabolic.csv"
    assert csv_path.exists(), f"Missing dataset: {csv_path}"
    return pd.read_csv(csv_path)


@pytest.fixture(scope="module")
def df_table_c():
    csv_path = DATA_DIR / "table_c_emergency_triage.csv"
    assert csv_path.exists(), f"Missing dataset: {csv_path}"
    return pd.read_csv(csv_path)


@pytest.fixture(scope="module")
def route_profile():
    json_path = DATA_DIR / "route_profile.json"
    assert json_path.exists(), f"Missing route profile: {json_path}"
    with open(json_path, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def scenarios():
    json_path = DATA_DIR / "scenarios.json"
    assert json_path.exists(), f"Missing scenarios.json: {json_path}"
    with open(json_path, encoding="utf-8") as f:
        return json.load(f)["scenarios"]


@pytest.fixture(scope="module")
def crew_history():
    json_path = DATA_DIR / "crew_history.json"
    assert json_path.exists(), f"Missing crew_history.json: {json_path}"
    with open(json_path, encoding="utf-8") as f:
        return json.load(f)


# =============================================================================
# 1. MODEL A: Real PhysioNet sEMG & PLOS ONE Myo-Fatigue Tests
# =============================================================================
class TestModelARealData:
    """Tests Model A Full and Fallback on real subjects from table_a_myo_fatigue.csv."""

    def test_real_subjects_monotonic_fatigue_progression(self, df_table_a):
        """For real subjects (e.g. S01, S10, S20), fatigue score must increase over time."""
        subjects_to_test = ["S01", "S10", "S20", "S30"]
        for subj in subjects_to_test:
            sub_df = df_table_a[df_table_a["subject_id"] == subj].sort_values("time_min")
            if len(sub_df) < 5:
                continue

            fresh_row = sub_df.iloc[0].to_dict()
            mid_row = sub_df.iloc[len(sub_df) // 2].to_dict()
            tired_row = sub_df.iloc[-1].to_dict()

            score_fresh, fail_fresh, _ = predict_fatigue(fresh_row, nirs_ok=True)
            score_mid, fail_mid, _ = predict_fatigue(mid_row, nirs_ok=True)
            score_tired, fail_tired, _ = predict_fatigue(tired_row, nirs_ok=True)

            # Monotonic increase in fatigue
            assert score_fresh < score_mid < score_tired, f"Failed on subject {subj}"
            # Time to failure must decrease as fatigue rises
            assert fail_fresh >= fail_mid >= fail_tired

    def test_nirs_fogged_fallback_mode_real_subjects(self, df_table_a):
        """When NIRS optical sensor is fogged, fallback model must operate on sEMG + IMU + HR."""
        sample_rows = df_table_a.sample(n=20, random_state=42)
        for _, r in sample_rows.iterrows():
            row_dict = r.to_dict()
            score_fb, fail_fb, used = predict_fatigue(row_dict, nirs_ok=False)

            assert 0.0 <= score_fb <= 100.0
            assert "fallback" in used
            assert fail_fb >= 0.0

            # Compare with ground truth muscle_fatigue_score
            gt = float(row_dict["muscle_fatigue_score"])
            assert abs(score_fb - gt) < 15.0, f"Fallback deviation too large: pred={score_fb}, gt={gt}"

    def test_model_a_time_to_failure_clamping(self):
        """Time to failure must clamp cleanly between 0 and 45 minutes."""
        exhausted = {
            "calf_smo2_pct": 25.0,
            "nirs_desat_slope": -4.0,
            "semg_mdf_shift_pct": -40.0,
            "imu_gait_asymmetry": 0.40,
        }
        score, fail_min, _ = predict_fatigue(exhausted, nirs_ok=True)
        assert score >= 85.0
        assert fail_min <= 2.0


# =============================================================================
# 2. MODEL B: Real Lunar Crater Topography & Apollo Benchmarks
# =============================================================================
class TestModelBRealData:
    """Tests Model B against NASA LRO LOLA route profile and Apollo 14-16 standards."""

    def test_nasa_mandatory_apollo_and_2023_benchmarks(self):
        """
        Master Plan §4.2 Mandatory NASA Benchmarks (Speed = 2.5 km/h, Fatigue = 10.0):
        1) 0.0° flat slope:  185 to 310 W (Apollo 14-16 EVA)
        2) 10.0° incline:    250 to 480 W
        3) 18.0° steep rim:  480 to 550 W (NASA 2023 Lunar EVA simulation)
        """
        w0, burn0, _, _ = predict_metabolic(speed_kmh=2.5, slope_deg=0.0, fatigue_score=10.0)
        assert 185.0 <= w0 <= 310.0, f"Flat slope benchmark failed: {w0} W"

        w10, burn10, _, _ = predict_metabolic(speed_kmh=2.5, slope_deg=10.0, fatigue_score=10.0)
        assert 250.0 <= w10 <= 480.0, f"10 deg slope benchmark failed: {w10} W"

        w18, burn18, _, _ = predict_metabolic(speed_kmh=2.5, slope_deg=18.0, fatigue_score=10.0)
        assert 480.0 <= w18 <= 550.0, f"18 deg steep slope benchmark failed: {w18} W"

        # Strict physical monotonicity
        assert w0 < w10 < w18
        assert burn0 < burn10 < burn18

    def test_real_lola_shackleton_rim_traverse(self, route_profile):
        """Simulate traverse along real 100-point LRO LOLA Shackleton Crater route."""
        tank_o2 = 700.0
        prev_dist = 0.0

        for pt in route_profile:
            slope = float(pt["slope_deg"])
            dist = float(pt["distance_m"])
            speed = 2.5

            fatigue = min(90.0, 5.0 + (dist / 5000.0) * 60.0)

            watts, burn_rate, walk_back_min, _ = predict_metabolic(
                speed_kmh=speed,
                slope_deg=slope,
                fatigue_score=fatigue,
                o2_tank_remaining_l=tank_o2,
            )

            assert 180.0 <= watts <= 850.0
            assert 0.5 <= burn_rate <= 3.0
            assert walk_back_min >= 0.0

            time_leg_min = (dist - prev_dist) / (speed * 1000.0 / 60.0) if dist > prev_dist else 0.0
            tank_o2 = max(0.0, tank_o2 - time_leg_min * burn_rate)
            prev_dist = dist

    def test_dynamic_walk_back_point_of_no_return_warning(self):
        """Walk-back limit must warn astronaut when usable O2 allows < 15 minutes before point of no return."""
        _, _, wb_safe, _ = predict_metabolic(2.5, 5.0, 15.0, o2_tank_remaining_l=650.0)
        assert wb_safe > 60.0

        _, _, wb_crit, _ = predict_metabolic(2.5, 5.0, 15.0, o2_tank_remaining_l=80.0)
        assert wb_crit < 15.0


# =============================================================================
# 3. MODEL C: Real PhysioNet BIDMC ICU & PTT Emergency Triage Tests
# =============================================================================
class TestModelCRealData:
    """Tests Model C on real physiological distributions from table_c_emergency_triage.csv."""

    def test_model_c_high_accuracy_on_real_samples(self, df_table_c):
        """Sample 50 random rows from each class in table_c and verify high classification accuracy."""
        for class_name in df_table_c["triage_class"].unique():
            sub = df_table_c[df_table_c["triage_class"] == class_name].sample(n=50, random_state=42)
            correct = 0
            for _, r in sub.iterrows():
                res = predict_triage(r.to_dict())
                if res["primary_class"] == class_name:
                    correct += 1
            acc = correct / len(sub)
            assert acc >= 0.94, f"Accuracy for class {class_name} fell below 94%: {acc:.2f}"

    def test_clinical_safety_rule_1_nitroglycerin_block(self, df_table_c):
        """NASA-STD-3001 Rule 1: Nitroglycerin administration is lethal and MUST be hard-blocked if Systolic BP < 90."""
        hypotensive_cases = df_table_c[df_table_c["bp_sys"] < 90.0].sample(n=30, random_state=42)
        for _, r in hypotensive_cases.iterrows():
            res = predict_triage(r.to_dict())
            assert res["dont_give_nitro"] is True
            assert res["nitroglycerin_alert"] is not None
            assert "DON'T GIVE NITROGLYCERIN" in res["nitroglycerin_alert"]
            assert any("DON'T GIVE NITROGLYCERIN" in step for step in res["protocol_steps"])

    def test_clinical_safety_rule_2_oxygen_surge(self, df_table_c):
        """NASA-STD-3001 Rule 2: If SpO2 < 92%, emergency 100% O2 surge must activate."""
        hypoxic_cases = df_table_c[df_table_c["spo2"] < 92.0].sample(n=30, random_state=42)
        for _, r in hypoxic_cases.iterrows():
            res = predict_triage(r.to_dict())
            assert res["oxygen_surge"] is True
            assert res["oxygen_alert"] is not None

    def test_clinical_safety_rule_3_flight_surgeons_alert(self, df_table_c):
        """NASA-STD-3001 Rule 3: Ischemia, Barotrauma, and shock conditions must queue ground Flight Surgeons."""
        critical_cases = df_table_c[df_table_c["triage_class"].isin(["Acute Coronary Ischemia", "Decompression Barotrauma"])].sample(n=20, random_state=42)
        for _, r in critical_cases.iterrows():
            res = predict_triage(r.to_dict())
            assert res["flight_surgeons_alert"] is True

    def test_explainable_tree_path_content(self):
        """Explainable surrogate tree must produce clinically interpretable paths with threshold comparisons."""
        # 1. Ischemia with ST elevation
        res_isch = predict_triage({
            "hr": 118, "bp_sys": 82, "bp_dia": 54, "spo2": 94.5, "resp_rate": 24,
            "st_elevation_mv": 0.286, "temp": 36.8, "chest_pain": 1, "cold_sweat": 1,
        })
        assert "ST elevation" in res_isch["tree_path"]
        assert "Acute Coronary Ischemia" in res_isch["tree_path"]

        # 2. Syncope with hypotension and fall
        res_sync = predict_triage({
            "hr": 85, "bp_sys": 78, "bp_dia": 48, "spo2": 97, "resp_rate": 15,
            "st_elevation_mv": 0.01, "temp": 36.5, "dizzy": 1, "fall_event": 1,
        })
        assert "Systolic BP" in res_sync["tree_path"]
        assert "Orthostatic Syncope" in res_sync["tree_path"]

        # 3. Hypercapnia with tachypnea
        res_co2 = predict_triage({
            "hr": 130, "bp_sys": 145, "bp_dia": 92, "spo2": 96, "resp_rate": 36,
            "st_elevation_mv": 0.01, "temp": 37.4, "short_breath": 1,
        })
        assert "Resp rate" in res_co2["tree_path"]
        assert "Hypercapnia CO2" in res_co2["tree_path"]

        # 4. Decompression Barotrauma with severe hypoxemia
        res_baro = predict_triage({
            "hr": 145, "bp_sys": 105, "bp_dia": 65, "spo2": 78, "resp_rate": 40,
            "st_elevation_mv": 0.01, "temp": 36.2, "short_breath": 1,
        })
        assert "SpO2" in res_baro["tree_path"]
        assert "Decompression Barotrauma" in res_baro["tree_path"]


# =============================================================================
# 4. FULL MISSION SCENARIOS & TELEMETRY TIMELINES (scenarios.json)
# =============================================================================
class TestMissionScenariosRealTimelines:
    """Tests 60-second timelines for all 6 mission scenarios from scenarios.json."""

    def test_scenario_normal_walk_stays_nominal_and_green(self, scenarios):
        """Normal walk scenario must stay 100% Green / Nominal across all 60 seconds."""
        timeline = scenarios["normal_walk"]["timeline_60s"]
        for pt in timeline:
            res = predict_all(pt)
            assert res["band"] == "GREEN"
            assert res["health_score"] >= 80.0
            assert res["model_c"]["primary_class"] == "Nominal"

    def test_scenario_chest_pain_triggers_emergency_and_nitro_block(self, scenarios):
        """Chest pain scenario must immediately trigger Acute Coronary Ischemia and Nitroglycerin block."""
        timeline = scenarios["chest_pain"]["timeline_60s"]
        for pt in timeline:
            res = predict_all(pt)
            assert res["band"] == "RED"
            assert res["model_c"]["primary_class"] == "Acute Coronary Ischemia"
            assert res["model_c"]["dont_give_nitro"] is True
            assert res["model_c"]["flight_surgeons_alert"] is True

    def test_scenario_steep_climb_reflects_high_metabolic_power(self, scenarios):
        """Steep climb scenario (18-22 deg) must show metabolic power >= 450 W."""
        timeline = scenarios["steep_climb"]["timeline_60s"]
        for pt in timeline:
            res = predict_all(pt)
            watts = res["model_b"]["metabolic_rate_watts"]
            assert watts >= 450.0, f"Steep climb metabolic power too low: {watts} W"

    def test_scenario_fall_in_crater_triggers_alert(self, scenarios):
        """Fall in crater must detect fall event and trigger red/yellow alert."""
        timeline = scenarios["fall_in_crater"]["timeline_60s"]
        for pt in timeline:
            res = predict_all(pt)
            assert res["band"] in ("YELLOW", "RED")
            assert res["health_score"] <= 60.0

    def test_scenario_tired_says_fine_detects_fatigue(self, scenarios):
        """Tired astronaut scenario must register elevated muscle fatigue (>= 50/100)."""
        timeline = scenarios["tired_says_fine"]["timeline_60s"]
        for pt in timeline:
            res = predict_all(pt)
            fatigue = res["model_a"]["muscle_fatigue_score"]
            assert fatigue >= 50.0, f"Tired astronaut fatigue too low: {fatigue}"


# =============================================================================
# 5. NASA OSDR 14-DAY RECOVERY & MASKING TRAJECTORIES
# =============================================================================
class TestNASAOSDR14DayTrends:
    """Tests 14-day history trends derived from NASA OSDR OSD-783 and OSD-435."""

    def test_crew_a_cumulative_fatigue_and_masking(self, crew_history):
        """Crew A experiences progressive muscle degradation and attempts to mask fatigue before EVA."""
        crew_a_hist = crew_history["Crew_A"]["history"]
        assert len(crew_a_hist) == 14

        day1 = crew_a_hist[0]
        day13 = crew_a_hist[12]

        # Soleus SmO2 drops due to cumulative disuse and EVA excursions (NASA OSDR OSD-783)
        assert day1["calf_smo2_pct"] > day13["calf_smo2_pct"]
        # Muscle fatigue score increases
        assert day1["objective_sensor_score"] > day13["objective_sensor_score"]
        # Sol 12 or 13 should detect masking or mismatch
        assert any(sol.get("masking_detected") or sol.get("mismatch_detected") for sol in crew_a_hist[10:14])
