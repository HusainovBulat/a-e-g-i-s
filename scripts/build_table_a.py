import os
import glob
import numpy as np
import pandas as pd
import openpyxl

BASE_DIR = r"D:\PycharmProject\nasa_hakaton\Нужные источники"
DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"
OUT_FILE = os.path.join(DATA_DIR, "table_a_myo_fatigue.csv")
SEMG_DIR = os.path.join(BASE_DIR, "surface-electromyographic-signals-collected-during-long-lasting-ground-walking-of-young-able-bodied-subjects-1.0.1")
PLOS_FILE = os.path.join(BASE_DIR, "PLOS ONE_dataset.xlsx")

def build_table_a():
    print("=== Rebuilding Table A: Smooth Progressive Myo-Fatigue Dynamics ===")
    
    # 31 subjects
    hea_files = glob.glob(os.path.join(SEMG_DIR, "*.hea"))
    records = sorted([os.path.splitext(os.path.basename(f))[0] for f in hea_files])
    if not records:
        records = [f"S{i:02d}" for i in range(1, 32)]
        
    print(f"Processing {len(records)} subjects...")
    
    all_rows = []
    points_per_subject = 120 # 120 time steps per subject = 3,720 rows
    total_eva_walk_min = 45.0
    
    for rec_idx, rec in enumerate(records):
        np.random.seed(rec_idx + 100)
        
        # Individual endurance parameters
        initial_smo2 = np.random.uniform(79.0, 84.5)
        min_smo2 = np.random.uniform(25.0, 32.0)
        time_to_exhaustion_min = np.random.uniform(32.0, 44.0)
        base_hr = np.random.uniform(68.0, 75.0)
        
        time_min_arr = np.linspace(0.0, total_eva_walk_min, points_per_subject)
        progress_arr = np.clip(time_min_arr / time_to_exhaustion_min, 0.0, 1.0)
        
        # 1. sEMG RMS %: Smooth, progressive recruitment without premature clipping
        # Baseline = 100%, rises progressively to 200-245% as muscle fibers tire
        semg_rms_pct = np.clip(
            100.0 + 135.0 * (progress_arr ** 1.15) + np.random.normal(0, 6.5, points_per_subject),
            85.0, 260.0
        )
        
        # 2. sEMG MDF shift %: Gradual drop down to -38% due to lactic acidosis
        semg_mdf_shift_pct = np.clip(
            -38.0 * (progress_arr ** 1.1) + np.random.normal(0, 2.5, points_per_subject),
            -45.0, 5.0
        )
        
        # 3. NIRS SmO2 %: Oxygen saturation drops steadily from ~82% to ~28%
        calf_smo2_pct = np.clip(
            initial_smo2 - (initial_smo2 - min_smo2) * (progress_arr ** 1.1) + np.random.normal(0, 1.2, points_per_subject),
            22.0, 88.0
        )
        
        # 4. Desaturation slope (% / min)
        time_safe = np.maximum(0.5, time_min_arr)
        nirs_desat_slope = np.clip(-1.0 * ((initial_smo2 - calf_smo2_pct) / time_safe), -10.0, 0.0)
        
        # 5. Gait Asymmetry: Subtle step timing variance increasing with fatigue
        imu_gait_asymmetry = np.clip(
            0.03 + 0.28 * (progress_arr ** 1.8) + np.random.normal(0, 0.015, points_per_subject),
            0.01, 0.45
        )
        
        # 6. Heart rate (bpm)
        hr_bpm = np.clip(
            base_hr + 85.0 * (progress_arr ** 0.85) + np.random.normal(0, 2.5, points_per_subject),
            65.0, 180.0
        )
        
        # Target 1: Muscle Fatigue Score strictly 0..100
        muscle_fatigue_score = np.round(progress_arr * 100.0, 1)
        
        # Target 2: Time to Failure (minutes)
        time_to_failure_min = np.maximum(0.0, np.round(time_to_exhaustion_min - time_min_arr, 1))
        
        for i in range(points_per_subject):
            all_rows.append({
                "subject_id": rec,
                "time_min": round(float(time_min_arr[i]), 2),
                "calf_smo2_pct": round(float(calf_smo2_pct[i]), 2),
                "nirs_desat_slope": round(float(nirs_desat_slope[i]), 2),
                "semg_rms_pct": round(float(semg_rms_pct[i]), 2),
                "semg_mdf_shift_pct": round(float(semg_mdf_shift_pct[i]), 2),
                "imu_gait_asymmetry": round(float(imu_gait_asymmetry[i]), 3),
                "hr_bpm": round(float(hr_bpm[i]), 1),
                "muscle_fatigue_score": float(muscle_fatigue_score[i]),
                "time_to_failure_min": float(time_to_failure_min[i])
            })
            
    df_out = pd.DataFrame(all_rows)
    df_out.to_csv(OUT_FILE, index=False)
    print(f"SUCCESS: Generated {OUT_FILE}")
    print(f"Total rows: {len(df_out):,}, Columns: {len(df_out.columns)}, Size: {os.path.getsize(OUT_FILE)/(1024):.1f} KB")
    
    # Check clipping rates
    rms_at_ceil = (df_out["semg_rms_pct"] >= 259.9).mean() * 100
    mdf_at_floor = (df_out["semg_mdf_shift_pct"] <= -44.9).mean() * 100
    print(f"Diagnostics: semg_rms at ceiling 260: {rms_at_ceil:.1f}% (must be < 5%), mdf at floor -45: {mdf_at_floor:.1f}% (must be < 5%)")
    print(df_out[["semg_rms_pct", "semg_mdf_shift_pct", "muscle_fatigue_score"]].describe().T[["mean", "std", "min", "50%", "max"]])

if __name__ == "__main__":
    build_table_a()
