"""Model sanity checks, incl. the 3 mandatory NASA benchmarks for Model B (Master Plan §4.2)."""

import pytest

from app.ml.models import ModelRegistry, o2_burn_l_min


@pytest.fixture(scope="module")
def reg():
    return ModelRegistry()


def test_model_b_flat_apollo_range(reg):
    w, _ = reg.predict_metabolic_watts(2.5, 0.0, 10.0)
    assert 185 <= w <= 310, w


def test_model_b_steep_2023_lunar_eva_range(reg):
    w, _ = reg.predict_metabolic_watts(2.5, 18.0, 10.0)
    assert 480 <= w <= 550, w


def test_model_b_monotonic_in_slope(reg):
    w = [reg.predict_metabolic_watts(2.5, s, 10.0)[0] for s in (0.0, 10.0, 18.0)]
    assert w[0] < w[1] < w[2], w


def test_o2_burn_formula():
    assert o2_burn_l_min(335.0, 0.0) == pytest.approx(1.0)
    assert o2_burn_l_min(335.0, 100.0) == pytest.approx(1.25)


def test_model_a_fatigue_ordering(reg):
    fresh, _ = reg.predict_fatigue({"calf_smo2_pct": 82, "nirs_desat_slope": 0, "semg_mdf_shift_pct": -1, "imu_gait_asymmetry": 0.05})
    tired, _ = reg.predict_fatigue({"calf_smo2_pct": 45, "nirs_desat_slope": -2.5, "semg_mdf_shift_pct": -30, "imu_gait_asymmetry": 0.3})
    assert 0 <= fresh < tired <= 100


def test_model_a_fallback_without_nirs(reg):
    score, used = reg.predict_fatigue({"semg_mdf_shift_pct": -30, "imu_gait_asymmetry": 0.3, "hr_bpm": 140}, nirs_ok=False)
    assert "fallback" in used and 0 <= score <= 100


def test_model_c_chest_pain_is_ischemia(reg):
    res = reg.triage({"hr": 118, "bp_sys": 82, "bp_dia": 54, "spo2": 94.5, "resp_rate": 24, "st_elevation_mv": 0.286,
                      "temp": 36.8, "chest_pain": 1, "dizzy": 1, "short_breath": 0, "cold_sweat": 1, "fall_event": 0})
    assert res["primary_class"] == "Acute Coronary Ischemia"
    assert "→ Acute Coronary Ischemia" in res["tree_path"]


def test_model_c_nominal(reg):
    res = reg.triage({"hr": 72, "bp_sys": 118, "bp_dia": 76, "spo2": 98, "resp_rate": 15, "st_elevation_mv": 0.0,
                      "temp": 36.7, "chest_pain": 0, "dizzy": 0, "short_breath": 0, "cold_sweat": 0, "fall_event": 0})
    assert res["primary_class"] == "Nominal"
