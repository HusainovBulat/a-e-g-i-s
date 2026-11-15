import unittest
import time
from app.rag_llm import (
    load_nasa_standards,
    retrieve_relevant_standards,
    generate_deterministic_fallback,
    generate_commander_summary
)

class TestRagLLM(unittest.TestCase):

    def test_load_standards(self):
        stds = load_nasa_standards()
        self.assertGreater(len(stds), 3)
        self.assertIn("NASA-STD-3001-VOL-1-EVAFITNESS", stds)
        self.assertIn("NASA-STD-3001-VOL-1-MUSCLE", stds)

    def test_retrieve_relevant_standards(self):
        # Masking payload
        payload = {
            "masking_detected": True,
            "readiness_score": 45.0,
            "vitals": {"sleep_hours": 5.2, "calf_smo2_pct": 48.0, "bp_sys": 118.0}
        }
        relevant = retrieve_relevant_standards(payload)
        titles = [r["title"] for r in relevant]
        # Should include EVA Fitness, Musculoskeletal, and Sleep
        self.assertTrue(any("4.2" in t for t in titles))
        self.assertTrue(any("4.3" in t for t in titles))
        self.assertTrue(any("5.1" in t for t in titles))

    def test_mismatch_detected_key_alias(self):
        # Test passing mismatch_detected (as in table_d / POST /evening ТЗ)
        payload_mismatch = {
            "crew_id": "Crew_A",
            "sol": 12,
            "mismatch_detected": True,  # Using mismatch_detected instead of masking_detected
            "readiness_score": 48.0,
            "delta": 46.0,
            "vitals": {"calf_smo2_pct": 52.0}
        }
        # 1. RAG standards retrieval must trigger
        stds = retrieve_relevant_standards(payload_mismatch)
        self.assertTrue(any("4.2" in s["title"] for s in stds))

        # 2. Fallback template must trigger swap schedule
        res = generate_deterministic_fallback(payload_mismatch)
        self.assertEqual(res["schedule_action"], "SWAP_SCHEDULE")
        self.assertTrue(res["masking_detected"])
        self.assertTrue(res["mismatch_detected"])

    def test_deterministic_fallback_scenarios(self):
        # Scenario A: Masking Detected -> Schedule Swap
        payload_mask = {
            "crew_id": "Crew_A",
            "crew_name": "Astronaut A",
            "sol": 12,
            "masking_detected": True,
            "readiness_score": 48.0,
            "delta": 45.0,
            "vitals": {"calf_smo2_pct": 52.0}
        }
        res_a = generate_deterministic_fallback(payload_mask)
        self.assertEqual(res_a["source"], "DETERMINISTIC_FALLBACK_TEMPLATE")
        self.assertEqual(res_a["schedule_action"], "SWAP_SCHEDULE")
        self.assertIn("Crew_B", res_a["recommended_replacement"])
        self.assertIn("Masking", res_a["commander_summary"])

        # Scenario B: Caution (Readiness 75, no masking) -> Reduce EVA
        payload_caution = {
            "crew_id": "Crew_C",
            "sol": 5,
            "masking_detected": False,
            "readiness_score": 75.0,
            "vitals": {"calf_smo2_pct": 68.0}
        }
        res_b = generate_deterministic_fallback(payload_caution)
        self.assertEqual(res_b["schedule_action"], "REDUCE_EVA_DURATION")

        # Scenario C: Nominal (Readiness 92) -> Cleared
        payload_nominal = {
            "crew_id": "Crew_B",
            "sol": 5,
            "masking_detected": False,
            "readiness_score": 92.0,
            "vitals": {"calf_smo2_pct": 80.0}
        }
        res_c = generate_deterministic_fallback(payload_nominal)
        self.assertEqual(res_c["schedule_action"], "CLEARED_NOMINAL")
        self.assertIn("CLEARED: NOMINAL READINESS", res_c["commander_summary"])

    def test_generate_summary_latency_and_fallback(self):
        payload = {
            "crew_id": "Crew_A",
            "sol": 12,
            "masking_detected": True,
            "readiness_score": 45.0
        }
        t0 = time.time()
        # Explicit empty api_key to simulate offline mode without key
        res = generate_commander_summary(payload, api_key="")
        elapsed_s = time.time() - t0

        self.assertLess(elapsed_s, 0.05, "Fallback must return in < 50 ms!")
        self.assertEqual(res["source"], "DETERMINISTIC_FALLBACK_TEMPLATE")
        self.assertEqual(res["schedule_action"], "SWAP_SCHEDULE")

    def test_exception_handling_with_invalid_key(self):
        payload = {
            "crew_id": "Crew_A",
            "sol": 12,
            "masking_detected": True,
            "readiness_score": 45.0
        }
        # Passing invalid key to trigger catch block
        res = generate_commander_summary(payload, api_key="invalid_test_key_12345", timeout_s=1.0)
        self.assertEqual(res["source"], "DETERMINISTIC_FALLBACK_TEMPLATE")
        self.assertIn("GROQ_EXCEPTION", res["fallback_reason"])
        self.assertEqual(res["schedule_action"], "SWAP_SCHEDULE")

if __name__ == "__main__":
    unittest.main()
