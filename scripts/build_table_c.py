import os
import glob
import numpy as np
import pandas as pd

BASE_DIR = r"D:\PycharmProject\nasa_hakaton\Нужные источники"
DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"
PULSE_CSV = os.path.join(BASE_DIR, "Pulse", "pulse_features_1hz.csv")
PPG_DIR = os.path.join(BASE_DIR, "ppg")
OUT_CSV = os.path.join(DATA_DIR, "table_c_emergency_triage.csv")

def build_table_c():
    print("=== Rebuilding Table C: Emergency Triage Decision Tree (Fixed Nominal & Vitals) ===")
    
    np.random.seed(42)
    n_per_class = 1500
    
    # -------------------------------------------------------------
    # 1. Class 0: Nominal (Healthy Baseline across Rest, Walk, Run)
    # -------------------------------------------------------------
    # Pulse Transit Time PPG (PTT) subjects
    df_pulse = pd.read_csv(PULSE_CSV)
    nom_chunks = []
    for act in ["sit", "walk", "run"]:
        sub = df_pulse[df_pulse["activity"] == act].sample(n=500, random_state=42)
        nom_chunks.append(sub)
    df_nom = pd.concat(nom_chunks, ignore_index=True)
    
    nominal_rows = []
    for _, r in df_nom.iterrows():
        # Clean medical vitals for healthy astronauts:
        bp_s = float(np.clip(r["bp_sys"], 102.0, 132.0))
        bp_d = round(bp_s * float(np.random.uniform(0.62, 0.68)), 1)
        core_temp = round(float(np.random.normal(36.65, 0.22)), 1)
        
        nominal_rows.append({
            "hr": round(float(r["hr"]), 1),
            "bp_sys": round(bp_s, 1),
            "bp_dia": bp_d,
            "spo2": round(float(np.clip(r["spo2"], 96.0, 99.5)), 1),
            "resp_rate": round(float(np.random.normal(15.5, 2.0)), 1),
            "st_elevation_mv": round(float(np.random.normal(0.01, 0.015)), 3),
            "temp": core_temp,
            "chest_pain": 0,
            "dizzy": 0,
            "short_breath": 0,
            "cold_sweat": 0,
            "fall_event": 0,  # Zero falls for healthy active crew!
            "triage_class": "Nominal",
            "class_id": 0,
            "dont_give_nitro": 0
        })
        
    print(f"Generated {len(nominal_rows)} Nominal rows: clean BP (102-132 / 65-88), normal temp (36.4-37.1 C), fall_event=0.")
    
    # -------------------------------------------------------------
    # Load BIDMC ICU numerics for real pathological telemetry
    # -------------------------------------------------------------
    bidmc_files = glob.glob(os.path.join(PPG_DIR, "*_Numerics.csv"))
    bidmc_dfs = []
    for f in bidmc_files:
        try:
            b_df = pd.read_csv(f)
            b_df.columns = [c.strip() for c in b_df.columns]
            if "HR" in b_df.columns and "SpO2" in b_df.columns and "RESP" in b_df.columns:
                b_clean = b_df.dropna(subset=["HR", "SpO2", "RESP"]).copy()
                if len(b_clean) > 50:
                    bidmc_dfs.append(b_clean)
        except Exception:
            pass
            
    bidmc_all = pd.concat(bidmc_dfs, ignore_index=True)
    
    # -------------------------------------------------------------
    # 2. Class 1: Acute Coronary Ischemia
    # -------------------------------------------------------------
    ischemia_rows = []
    bidmc_sample_1 = bidmc_all.sample(n=n_per_class, replace=True, random_state=101).reset_index(drop=True)
    for _, b in bidmc_sample_1.iterrows():
        # In 35% of severe myocardial infarctions, cardiogenic collapse drops systolic BP < 90 mmHg
        has_hypotension = np.random.rand() < 0.35
        bp_s = float(np.random.uniform(74.0, 88.0)) if has_hypotension else float(np.random.uniform(94.0, 155.0))
        bp_d = round(bp_s * float(np.random.uniform(0.62, 0.70)), 1)
        st_shift = float(np.random.uniform(0.18, 0.48)) # Diagnostic ST elevation
        core_temp = round(float(np.random.normal(36.5, 0.35)), 1)
        
        ischemia_rows.append({
            "hr": round(float(b["HR"]) + float(np.random.normal(15.0, 5.0)), 1),
            "bp_sys": round(bp_s, 1),
            "bp_dia": bp_d,
            "spo2": round(float(np.clip(b["SpO2"] - np.random.uniform(2.0, 6.0), 88.0, 97.0)), 1),
            "resp_rate": round(float(np.clip(b["RESP"] + np.random.uniform(4.0, 10.0), 18.0, 36.0)), 1),
            "st_elevation_mv": round(st_shift, 3),
            "temp": core_temp,
            "chest_pain": 1,
            "dizzy": 1 if has_hypotension else int(np.random.rand() < 0.3),
            "short_breath": 1,
            "cold_sweat": 1,
            "fall_event": int(has_hypotension and np.random.rand() < 0.5),
            "triage_class": "Acute Coronary Ischemia",
            "class_id": 1,
            "dont_give_nitro": 1 if bp_s < 90.0 else 0
        })
        
    # -------------------------------------------------------------
    # 3. Class 2: Orthostatic Syncope (Gravity Redistribution)
    # -------------------------------------------------------------
    syncope_rows = []
    bidmc_sample_2 = bidmc_all.sample(n=n_per_class, replace=True, random_state=202).reset_index(drop=True)
    for _, b in bidmc_sample_2.iterrows():
        bp_s = float(np.random.uniform(70.0, 88.0)) # Profound hypotension < 90
        bp_d = round(bp_s * float(np.random.uniform(0.58, 0.68)), 1)
        core_temp = round(float(np.random.normal(36.4, 0.25)), 1)
        
        syncope_rows.append({
            "hr": round(float(b["HR"]) + float(np.random.normal(4.0, 6.0)), 1),
            "bp_sys": round(bp_s, 1),
            "bp_dia": bp_d,
            "spo2": round(float(np.clip(b["SpO2"], 95.0, 99.0)), 1),
            "resp_rate": round(float(np.random.normal(15.0, 2.0)), 1),
            "st_elevation_mv": round(float(np.random.normal(0.01, 0.015)), 3),
            "temp": core_temp,
            "chest_pain": 0,
            "dizzy": 1,
            "short_breath": 0,
            "cold_sweat": int(np.random.rand() < 0.6),
            "fall_event": 1, # Sudden collapse to floor
            "triage_class": "Orthostatic Syncope",
            "class_id": 2,
            "dont_give_nitro": 1 # Hard-blocked (BP < 90)
        })
        
    # -------------------------------------------------------------
    # 4. Class 3: Hypercapnia CO2 (Scrubber Failure)
    # -------------------------------------------------------------
    co2_rows = []
    bidmc_sample_3 = bidmc_all.sample(n=n_per_class, replace=True, random_state=303).reset_index(drop=True)
    for _, b in bidmc_sample_3.iterrows():
        bp_s = float(np.random.uniform(128.0, 162.0))
        bp_d = round(bp_s * float(np.random.uniform(0.65, 0.72)), 1)
        core_temp = round(float(np.random.normal(37.3, 0.35)), 1) # Flushed skin
        
        co2_rows.append({
            "hr": round(float(b["HR"]) + float(np.random.uniform(22.0, 42.0)), 1),
            "bp_sys": round(bp_s, 1),
            "bp_dia": bp_d,
            "spo2": round(float(np.clip(b["SpO2"] - np.random.uniform(3.0, 7.0), 88.0, 94.0)), 1),
            "resp_rate": round(float(np.random.uniform(28.0, 44.0)), 1), # Severe hyperventilation
            "st_elevation_mv": round(float(np.random.normal(0.02, 0.015)), 3),
            "temp": core_temp,
            "chest_pain": int(np.random.rand() < 0.2),
            "dizzy": 1,
            "short_breath": 1,
            "cold_sweat": 0,
            "fall_event": int(np.random.rand() < 0.3),
            "triage_class": "Hypercapnia CO2",
            "class_id": 3,
            "dont_give_nitro": 0
        })
        
    # -------------------------------------------------------------
    # 5. Class 4: Decompression Barotrauma (Pressure Loss)
    # -------------------------------------------------------------
    baro_rows = []
    bidmc_sample_4 = bidmc_all.sample(n=n_per_class, replace=True, random_state=404).reset_index(drop=True)
    for _, b in bidmc_sample_4.iterrows():
        bp_s = float(np.random.uniform(92.0, 138.0))
        bp_d = round(bp_s * float(np.random.uniform(0.60, 0.68)), 1)
        core_temp = round(float(np.random.normal(36.2, 0.4)), 1)
        
        baro_rows.append({
            "hr": round(float(np.random.uniform(125.0, 168.0)), 1),
            "bp_sys": round(bp_s, 1),
            "bp_dia": bp_d,
            "spo2": round(float(np.random.uniform(72.0, 86.5)), 1), # Critical hypoxemia
            "resp_rate": round(float(np.random.uniform(32.0, 48.0)), 1),
            "st_elevation_mv": round(float(np.random.normal(0.01, 0.015)), 3),
            "temp": core_temp,
            "chest_pain": 1, # Acute pleuritic pain
            "dizzy": 1,
            "short_breath": 1, # Severe air hunger
            "cold_sweat": 1,
            "fall_event": int(np.random.rand() < 0.5),
            "triage_class": "Decompression Barotrauma",
            "class_id": 4,
            "dont_give_nitro": 1 if bp_s < 90 else 0
        })

    all_rows = nominal_rows + ischemia_rows + syncope_rows + co2_rows + baro_rows
    df_triage = pd.DataFrame(all_rows)
    df_triage = df_triage.sample(frac=1.0, random_state=42).reset_index(drop=True)
    
    # Enforce strict interlock column
    df_triage["dont_give_nitro"] = (df_triage["bp_sys"] < 90.0).astype(int)
    
    df_triage.to_csv(OUT_CSV, index=False)
    print(f"SUCCESS: Generated {OUT_CSV}")
    print(f"Total rows: {len(df_triage):,}, Columns: {len(df_triage.columns)}, Size: {os.path.getsize(OUT_CSV)/(1024):.1f} KB")
    
    # Diagnostics check on Nominal class
    nom_sub = df_triage[df_triage["class_id"] == 0]
    print("\nDiagnostics on Nominal class:")
    print(f"bp_sys == bp_dia count: {(nom_sub['bp_sys'] == nom_sub['bp_dia']).sum()} (must be 0)")
    print(f"temp range: [{nom_sub['temp'].min()} .. {nom_sub['temp'].max()}] °C (must be 35.8..37.3)")
    print(f"fall_event sum: {nom_sub['fall_event'].sum()} (must be 0)")
    print(nom_sub[["hr", "bp_sys", "bp_dia", "spo2", "temp", "fall_event"]].head(3))

if __name__ == "__main__":
    build_table_c()
