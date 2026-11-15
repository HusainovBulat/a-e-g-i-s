import unittest
from app.core_math import (
    clamp,
    classify_health_band,
    scale_slider_to_system,
    scale_system_to_slider,
    get_environment_shift,
    calculate_organ_scores,
    detect_masking,
    calculate_eva_readiness_score,
    simulate_eva_consequences,
    apply_mode2_safety_rules,
    calculate_walk_back_limit
)

class TestCoreMath(unittest.TestCase):

    def test_clamping_and_scaling(self):
        self.assertEqual(clamp(150, 0, 100), 100.0)
        self.assertEqual(clamp(-10, 0, 100), 0.0)
        self.assertEqual(scale_slider_to_system(8.5), 85.0)
        self.assertEqual(scale_slider_to_system(12.0), 100.0)
        self.assertEqual(scale_system_to_slider(75.0), 7.5)

    def test_health_bands(self):
        self.assertEqual(classify_health_band(85.0)["band"], "green")
        self.assertEqual(classify_health_band(80.0)["band"], "green")
        self.assertEqual(classify_health_band(79.9)["band"], "yellow")
        self.assertEqual(classify_health_band(60.0)["band"], "yellow")
        self.assertEqual(classify_health_band(59.9)["band"], "red")
        self.assertEqual(classify_health_band(10.0)["band"], "red")

    def test_environment_shifts(self):
        mars = get_environment_shift("spacecraft_mars_transit")
        self.assertEqual(mars["gravity_g"], 0.0)
        self.assertEqual(mars["hazards"]["radiation"], "high")
        self.assertEqual(mars["baseline_shift"]["cortisol"], 15.0)

        suit = get_environment_shift("surface_eva_spacesuit")
        self.assertEqual(suit["baseline_shift"]["hr"], 15.0)
        self.assertEqual(suit["baseline_shift"]["smo2"], -8.0)

    def test_organ_scores_6_zones(self):
        vitals = {
            "hr": 72, "sys": 120, "dia": 78, "spo2": 99.0,
            "resp": 16, "temp": 36.6, "blood_sugar_mgdl": 90.0,
            "smo2": 80.0, "st": 0.0, "co2_pp_mmhg": 2.0
        }
        res = calculate_organ_scores(vitals, "lunar_base_habitat")
        zones = res["organ_zones"]
        self.assertEqual(len(zones), 6)
        self.assertIn("cns_brain", zones)
        self.assertIn("cardiovascular", zones)
        self.assertIn("respiratory", zones)
        self.assertIn("immune_thermo", zones)
        self.assertIn("metabolic_nutrition", zones)
        self.assertIn("musculoskeletal", zones)

        for z_key, z_val in zones.items():
            self.assertTrue(0.0 <= z_val["score"] <= 100.0, f"Zone {z_key} out of bounds")
        self.assertTrue(0.0 <= res["composite_health_score"] <= 100.0)

    def test_masking_detector_thresholds(self):
        # Case 1: Delta = 25.0 (< 30) -> No masking
        res_no_mask = detect_masking([7.5, 7.5, 7.5, 7.5, 7.5], 50.0)
        self.assertFalse(res_no_mask["masking_detected"])

        # Case 2: Delta = 30.0 (>= 30) -> MASKING TRIGGERED
        res_mask = detect_masking([8.0, 8.0, 8.0, 8.0, 8.0], 50.0)
        self.assertTrue(res_mask["masking_detected"])
        self.assertFalse(res_mask["eva_auto_clearance"])
        self.assertEqual(res_mask["escalation_level"], "CREW_COMMANDER_ATTENTION")
        self.assertIn("MASKING DETECTED", res_mask["alert_banner"])

        # Case 3: High energy (9.0) with severe objective fatigue (40.0)
        res_energy_mask = detect_masking([5.0, 9.0, 5.0, 5.0, 5.0], 40.0)
        self.assertTrue(res_energy_mask["masking_detected"])

    def test_consequence_simulator_and_quests(self):
        # Base score 45 (compromised)
        # Without quests: 45
        no_quests = calculate_eva_readiness_score(45.0, {})
        self.assertEqual(no_quests["readiness_score"], 45.0)
        self.assertEqual(no_quests["eva_status"], "PROHIBITED")

        # Hydration quest (+15): 45 + 15 = 60 (Caution)
        q_hydro = calculate_eva_readiness_score(45.0, {"hydration": True})
        self.assertEqual(q_hydro["readiness_score"], 60.0)
        self.assertEqual(q_hydro["eva_status"], "CAUTION")

        # All 3 quests: 45 + 15 + 18 + 20 = 98 (Cleared >= 85)
        q_all = calculate_eva_readiness_score(45.0, {"hydration": True, "compression": True, "breathing": True})
        self.assertEqual(q_all["readiness_score"], 98.0)
        self.assertEqual(q_all["eva_status"], "CLEARED")

        # Consequence curves for Chart.js
        sim = simulate_eva_consequences(45.0, {"hydration": True, "compression": True, "breathing": True})
        labels = sim["chart_data"]["labels"]
        red_data = sim["chart_data"]["datasets"][0]["data"]
        green_data = sim["chart_data"]["datasets"][1]["data"]

        # Check uniform 10-minute intervals (no stretched tail)
        self.assertEqual(len(labels), 13)
        self.assertEqual(labels, ["0m", "10m", "20m", "30m", "40m", "50m", "60m", "70m", "80m", "90m", "100m", "110m", "120m"])
        self.assertEqual(len(labels), len(red_data))
        self.assertEqual(len(labels), len(green_data))
        self.assertEqual(sim["failure_minute"], 110)

        # Red curve should collapse at minute 110
        idx_110 = labels.index("110m")
        self.assertLess(red_data[idx_110], 25.0)
        # Green curve should stay resilient (> 75.0)
        self.assertGreater(green_data[idx_110], 75.0)

    def test_mode2_safety_interlocks(self):
        # Test 1: Nitroglycerin block when BP_sys < 90
        vitals_hypo = {"sys": 88, "dia": 56, "spo2": 97}
        triage_hypo = apply_mode2_safety_rules("Acute Coronary Ischemia", vitals_hypo)
        self.assertTrue(triage_hypo["critical_interlocks"]["dont_give_nitro"])
        self.assertIn("DO NOT ADMINISTER NITROGLYCERIN", triage_hypo["critical_interlocks"]["nitro_contraindication_banner"])
        # Step 2 must be blocked
        self.assertEqual(triage_hypo["first_aid_protocol"]["steps"][1]["status"], "blocked")

        # Test 2: Nitroglycerin ALLOWED when BP_sys >= 90
        vitals_normo = {"sys": 130, "dia": 85, "spo2": 97}
        triage_normo = apply_mode2_safety_rules("Acute Coronary Ischemia", vitals_normo)
        self.assertFalse(triage_normo["critical_interlocks"]["dont_give_nitro"])
        self.assertEqual(triage_normo["first_aid_protocol"]["steps"][1]["status"], "recommended")

        # Test 3: SpO2 < 92 trigger high-flow oxygen
        vitals_hypox = {"sys": 110, "dia": 70, "spo2": 90.5}
        triage_hypox = apply_mode2_safety_rules("Hypercapnia CO2", vitals_hypox)
        self.assertTrue(triage_hypox["critical_interlocks"]["trigger_o2_surge"])
        self.assertIn("CRITICAL HYPOXEMIA", triage_hypox["critical_interlocks"]["o2_alert"])

    def test_st_elevation_compatibility(self):
        # Case 1: passing st_elevation_mv = 0.286 (as in table_c)
        vitals_mv = {"st_elevation_mv": 0.286, "hr": 70, "sys": 120}
        res_mv = calculate_organ_scores(vitals_mv)
        st_mv = res_mv["organ_zones"]["cardiovascular"]["key_metrics"]["st_elevation_mv"]
        self.assertAlmostEqual(st_mv, 0.286, places=3)
        self.assertLess(res_mv["organ_zones"]["cardiovascular"]["score"], 70.0)

        # Case 2: passing st_elevation_mm = 2.86 (in mm, should auto-convert to 0.286 mV)
        vitals_mm = {"st_elevation_mm": 2.86, "hr": 70, "sys": 120}
        res_mm = calculate_organ_scores(vitals_mm)
        st_from_mm = res_mm["organ_zones"]["cardiovascular"]["key_metrics"]["st_elevation_mv"]
        self.assertAlmostEqual(st_from_mm, 0.286, places=3)

        # Case 3: passing st = 0.286
        vitals_st = {"st": 0.286, "hr": 70, "sys": 120}
        res_st = calculate_organ_scores(vitals_st)
        self.assertEqual(res_mv["organ_zones"]["cardiovascular"]["score"], res_st["organ_zones"]["cardiovascular"]["score"])

    def test_walk_back_limit(self):
        # 750L tank, 150L reserve -> 600L usable / 2.0 L/min = 300 min (at 0 deg, 2.5 km/h)
        wb = calculate_walk_back_limit(750.0, 2.0, slope_deg=0.0, speed_kmh=2.5)
        self.assertEqual(wb["usable_o2_liters"], 600.0)
        self.assertEqual(wb["walk_back_limit_minutes"], 300.0)
        self.assertEqual(wb["safe_return_range_km"], 12.5)  # 300 min = 5 hours * 2.5 km/h = 12.5 km
        self.assertEqual(wb["warning_level"], "NOMINAL_TRAVERSE")

        # Low O2: 170L left -> 20L usable / 2.0 L/min = 10 min -> WARNING
        wb_warn = calculate_walk_back_limit(170.0, 2.0, slope_deg=0.0, speed_kmh=2.5)
        self.assertEqual(wb_warn["walk_back_limit_minutes"], 10.0)
        self.assertEqual(wb_warn["safe_return_range_km"], 0.42)
        self.assertEqual(wb_warn["warning_level"], "WARNING_WALK_BACK_APPROACHING")

        # Critical: 156L left -> 6L usable / 2.0 L/min = 3 min -> CRITICAL
        wb_crit = calculate_walk_back_limit(156.0, 2.0, slope_deg=0.0, speed_kmh=2.5)
        self.assertEqual(wb_crit["walk_back_limit_minutes"], 3.0)
        self.assertEqual(wb_crit["warning_level"], "CRITICAL_POINT_OF_NO_RETURN")

        # Test speed effect: walking faster at 3.5 km/h burns more O2 per minute
        wb_fast = calculate_walk_back_limit(750.0, 2.0, slope_deg=0.0, speed_kmh=3.5)
        self.assertGreater(wb_fast["return_burn_rate_adjusted"], 2.0)
        self.assertLess(wb_fast["walk_back_limit_minutes"], 300.0)

if __name__ == "__main__":
    unittest.main()
