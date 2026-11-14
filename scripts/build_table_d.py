import os
import glob
import numpy as np
import pandas as pd

BASE_DIR = r"D:\PycharmProject\nasa_hakaton\Нужные источники"
DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"
OUT_CSV = os.path.join(DATA_DIR, "table_d_osdr_14day_trend.csv")
OSD783_DIR = os.path.join(BASE_DIR, "osd783")
OSD435_DIR = os.path.join(BASE_DIR, "osd435")

def build_table_d():
    print("=== Rebuilding Table D: 14-Day OSDR Trends (Fixed Masking Delta >= 40 points) ===")
    
    crew_configs = {
        "Crew_A": {
            "role": "EVA Specialist",
            "base_smo2": 82.0,
            "eva_days": [3, 7, 11, 14],
            "masking_sols": [11, 12, 13], # Astronaut A over-reports readiness before EVA
            "base_sleep": 7.4
        },
        "Crew_B": {
            "role": "Systems Engineer",
            "base_smo2": 80.0,
            "eva_days": [4, 9],
            "masking_sols": [],
            "base_sleep": 6.8
        },
        "Crew_C": {
            "role": "Mission Specialist",
            "base_smo2": 84.0,
            "eva_days": [6, 12],
            "masking_sols": [],
            "base_sleep": 8.1
        },
        "Crew_D": {
            "role": "Commander",
            "base_smo2": 81.0,
            "eva_days": [5, 10],
            "masking_sols": [],
            "base_sleep": 7.2
        }
    }
    
    rows = []
    np.random.seed(42)
    
    for crew_id, cfg in crew_configs.items():
        cum_bone_load_g = 0.0
        
        for sol in range(1, 15):
            is_eva = sol in cfg["eva_days"]
            is_masking = sol in cfg["masking_sols"]
            
            # 1. Muscle calf SmO2 degradation
            sol_fatigue_penalty = 14.0 if is_eva else (0.9 * sol)
            if sol > 10 and crew_id == "Crew_A":
                sol_fatigue_penalty += 16.0 # severe cumulative exhaustion
            calf_smo2 = np.clip(cfg["base_smo2"] - sol_fatigue_penalty + np.random.normal(0, 1.0), 32.0, 85.0)
            
            # 2. Cumulative bone load (g*hours)
            daily_bone_load = np.random.uniform(28.0, 45.0) if is_eva else np.random.uniform(8.0, 15.0)
            cum_bone_load_g += daily_bone_load
            
            # 3. Sleep hours
            sleep_stress = 0.14 * sol
            sleep_hours = np.clip(cfg["base_sleep"] - sleep_stress + np.random.normal(0, 0.35), 4.6, 8.5)
            
            # 4. Blood sugar strictly in mg/dL
            base_glucose = 88.0
            glucose_stress = 2.4 * sol if is_eva else 1.2 * sol
            blood_sugar_mgdl = np.clip(base_glucose + glucose_stress + np.random.normal(0, 2.5), 82.0, 142.0)
            
            # 5. Resting HR (bpm)
            resting_hr = np.clip(62.0 + 0.9 * sol + (7.0 if is_eva else 0.0) + np.random.normal(0, 1.2), 58.0, 94.0)
            
            # 6. Body temperature (C)
            temp_c = np.clip(36.6 + 0.02 * sol + np.random.normal(0, 0.08), 36.4, 37.3)
            
            # 7. Objective Sensor Score (0..100)
            if is_masking:
                # Heavily exhausted objectively (38.0 .. 52.0 points)
                obj_score = float(np.random.uniform(41.0, 48.5))
            else:
                obj_score = 100.0 - (82.0 - calf_smo2)*0.9 - max(0.0, 7.5 - sleep_hours)*6.0 - max(0.0, blood_sugar_mgdl - 100.0)*0.4 - (resting_hr - 60.0)*0.5
                obj_score = float(np.clip(obj_score, 20.0, 98.0))
                
            obj_score = round(obj_score, 1)
            
            # 8. Subjective Sliders (strictly 0..10)
            if is_masking:
                # Astronaut deliberately claims maximum scores on ALL 5 sliders (8.8 .. 9.5) to clear EVA check
                subj_energy = round(float(np.random.uniform(8.8, 9.4)), 1)
                subj_sleep = round(float(np.random.uniform(8.7, 9.3)), 1)
                subj_mood = round(float(np.random.uniform(8.9, 9.5)), 1)
                subj_pain_free = round(float(np.random.uniform(8.8, 9.4)), 1)
                subj_nutrition = round(float(np.random.uniform(9.0, 9.5)), 1)
                mismatch = 1
            else:
                # Normal honest reporting: mirrors objective sensor score / 10
                base_val = obj_score / 10.0
                subj_energy = round(float(np.clip(base_val + np.random.normal(0, 0.4), 1.0, 10.0)), 1)
                subj_sleep = round(float(np.clip(sleep_hours * 1.1 + np.random.normal(0, 0.3), 1.0, 10.0)), 1)
                subj_mood = round(float(np.clip(8.5 - 0.2 * sol + np.random.normal(0, 0.3), 2.0, 10.0)), 1)
                subj_pain_free = round(float(np.clip(9.5 - (3.0 if is_eva else 0.8) - 0.1*sol, 2.0, 10.0)), 1)
                subj_nutrition = round(float(np.clip(8.2 + np.random.normal(0, 0.4), 3.0, 10.0)), 1)
                
                # Check mismatch trigger: subjective avg * 10 - objective > 30
                avg_subj = (subj_energy + subj_sleep + subj_mood + subj_pain_free + subj_nutrition) / 5.0 * 10.0
                mismatch = 1 if (avg_subj - obj_score > 30.0) else 0
                
            rows.append({
                "sol": sol,
                "crew_id": crew_id,
                "role": cfg["role"],
                "is_eva_day": int(is_eva),
                "calf_smo2_pct": round(calf_smo2, 1),
                "cum_bone_load_g": round(cum_bone_load_g, 1),
                "sleep_hours": round(sleep_hours, 1),
                "blood_sugar_mgdl": round(blood_sugar_mgdl, 1),
                "resting_hr_bpm": round(resting_hr, 1),
                "body_temp_c": round(temp_c, 1),
                "subjective_energy_slider": subj_energy,
                "subjective_sleep_slider": subj_sleep,
                "subjective_mood_slider": subj_mood,
                "subjective_pain_free_slider": subj_pain_free,
                "subjective_nutrition_slider": subj_nutrition,
                "objective_sensor_score": obj_score,
                "mismatch_detected": mismatch
            })
            
    df_out = pd.DataFrame(rows)
    df_out.to_csv(OUT_CSV, index=False)
    print(f"SUCCESS: Generated {OUT_CSV}")
    print(f"Total rows: {len(df_out)}, Columns: {len(df_out.columns)}, Size: {os.path.getsize(OUT_CSV)/(1024):.1f} KB")
    
    # Verify Delta on Sol 11, 12, 13
    mask_cases = df_out[df_out["crew_id"] == "Crew_A"].iloc[10:13].copy()
    mask_cases["subj_avg_scaled"] = (
        mask_cases["subjective_energy_slider"] +
        mask_cases["subjective_sleep_slider"] +
        mask_cases["subjective_mood_slider"] +
        mask_cases["subjective_pain_free_slider"] +
        mask_cases["subjective_nutrition_slider"]
    ) / 5.0 * 10.0
    mask_cases["mismatch_delta"] = mask_cases["subj_avg_scaled"] - mask_cases["objective_sensor_score"]
    print("\nVerified Masking Deltas on Sol 11, 12, 13 (Must be > 30 points):")
    print(mask_cases[["sol", "subj_avg_scaled", "objective_sensor_score", "mismatch_delta", "mismatch_detected"]])

if __name__ == "__main__":
    build_table_d()
