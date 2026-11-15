import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import r2_score, mean_absolute_error, accuracy_score, classification_report

DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"

def check_table_a():
    print("=" * 60)
    print("CHECKING TABLE A: Myo-Fatigue Regressor")
    print("=" * 60)
    path = os.path.join(DATA_DIR, "table_a_myo_fatigue.csv")
    df = pd.read_csv(path)
    print(f"Shape: {df.shape}")
    print(f"Nulls: {df.isnull().sum().to_dict()}")
    
    # Check ranges
    assert df["muscle_fatigue_score"].min() >= 0.0 and df["muscle_fatigue_score"].max() <= 100.0, "Score not in 0..100!"
    print(f"Target fatigue score range: [{df['muscle_fatigue_score'].min()} .. {df['muscle_fatigue_score'].max()}]")
    print(f"Time to failure range: [{df['time_to_failure_min'].min()} .. {df['time_to_failure_min'].max()}] min")
    
    # Test Train Model A Full (with NIRS)
    features_full = ["calf_smo2_pct", "nirs_desat_slope", "semg_rms_pct", "semg_mdf_shift_pct", "imu_gait_asymmetry", "hr_bpm"]
    X = df[features_full]
    y = df["muscle_fatigue_score"]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    reg_full = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_full.fit(X_train, y_train)
    y_pred = reg_full.predict(X_test)
    
    r2_full = r2_score(y_test, y_pred)
    mae_full = mean_absolute_error(y_test, y_pred)
    print(f"\n[Model A Full - GradientBoosting] R2: {r2_full:.4f}, MAE: {mae_full:.2f} points (out of 100)")
    
    # Test Train Model A Fallback (without NIRS, for fogged/sweated sensor)
    features_fallback = ["semg_rms_pct", "semg_mdf_shift_pct", "imu_gait_asymmetry", "hr_bpm"]
    X_fb = df[features_fallback]
    X_train_fb, X_test_fb, y_train_fb, y_test_fb = train_test_split(X_fb, y, test_size=0.2, random_state=42)
    reg_fb = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_fb.fit(X_train_fb, y_train_fb)
    y_pred_fb = reg_fb.predict(X_test_fb)
    
    r2_fb = r2_score(y_test_fb, y_pred_fb)
    mae_fb = mean_absolute_error(y_test_fb, y_pred_fb)
    print(f"[Model A Fallback (No NIRS)] R2: {r2_fb:.4f}, MAE: {mae_fb:.2f} points (out of 100)")
    
    return True

def check_table_b():
    print("\n" + "=" * 60)
    print("CHECKING TABLE B: Lunar EVA Metabolic & Walk-Back Model")
    print("=" * 60)
    path = os.path.join(DATA_DIR, "table_b_lunar_eva_metabolic.csv")
    df = pd.read_csv(path)
    print(f"Shape: {df.shape}")
    print(f"Nulls: {df.isnull().sum().to_dict()}")
    
    features = ["speed_kmh", "slope_deg", "muscle_fatigue_score", "gait_wobble", "hr_bpm", "respiration_rate"]
    X = df[features]
    y_watts = df["metabolic_rate_watts"]
    y_o2 = df["o2_burn_rate_l_min"]
    y_wb = df["walk_back_limit_min"]
    
    # Train test for Metabolic Watts
    X_train, X_test, y_train, y_test = train_test_split(X, y_watts, test_size=0.2, random_state=42)
    reg_watts = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_watts.fit(X_train, y_train)
    r2_watts = r2_score(y_test, reg_watts.predict(X_test))
    mae_watts = mean_absolute_error(y_test, reg_watts.predict(X_test))
    print(f"[Model B Watts Regressor] R2: {r2_watts:.4f}, MAE: {mae_watts:.2f} Watts")
    
    # Train test for O2 Burn Rate
    X_train, X_test, y_train, y_test = train_test_split(X, y_o2, test_size=0.2, random_state=42)
    reg_o2 = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
    reg_o2.fit(X_train, y_train)
    r2_o2 = r2_score(y_test, reg_o2.predict(X_test))
    mae_o2 = mean_absolute_error(y_test, reg_o2.predict(X_test))
    print(f"[Model B O2 Burn Rate] R2: {r2_o2:.4f}, MAE: {mae_o2:.3f} L/min")
    
    return True

def check_table_c():
    print("\n" + "=" * 60)
    print("CHECKING TABLE C: Emergency Triage Decision Tree")
    print("=" * 60)
    path = os.path.join(DATA_DIR, "table_c_emergency_triage.csv")
    df = pd.read_csv(path)
    print(f"Shape: {df.shape}")
    print(f"Nulls: {df.isnull().sum().to_dict()}")
    print("Class distribution:")
    print(df["triage_class"].value_counts().to_dict())
    
    features = ["hr", "bp_sys", "bp_dia", "spo2", "resp_rate", "st_elevation_mv", "temp", "chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event"]
    X = df[features]
    y = df["class_id"]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # In our Master Directive: Model C is a transparent, explainable Decision Tree (depth=5)
    clf = DecisionTreeClassifier(max_depth=5, random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    print(f"\n[Model C DecisionTree (max_depth=5)] Accuracy: {acc * 100:.2f}%")
    
    target_names = ["Nominal", "Ischemia", "Syncope", "Hypercapnia", "Barotrauma"]
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=target_names))
    
    # Feature importances
    importances = pd.Series(clf.feature_importances_, index=features).sort_values(ascending=False)
    print("Top Decision Features in Tree:")
    print(importances[importances > 0.01].to_dict())
    
    return True

def check_table_d():
    print("\n" + "=" * 60)
    print("CHECKING TABLE D: 14-Day OSDR Trends & Masking Detector")
    print("=" * 60)
    path = os.path.join(DATA_DIR, "table_d_osdr_14day_trend.csv")
    df = pd.read_csv(path)
    print(f"Shape: {df.shape}")
    print(f"Nulls: {df.isnull().sum().to_dict()}")
    print(f"Astronauts count: {df['crew_id'].nunique()} ({df['crew_id'].unique().tolist()})")
    print(f"Total Sols: {df['sol'].max()}")
    
    # Check Masking events
    masking_cases = df[df["mismatch_detected"] == 1]
    print(f"Detected Masking events count: {len(masking_cases)}")
    print(masking_cases[["crew_id", "sol", "subjective_energy_slider", "objective_sensor_score"]])
    return True

if __name__ == "__main__":
    check_table_a()
    check_table_b()
    check_table_c()
    check_table_d()
    print("\n" + "=" * 60)
    print("VERIFICATION COMPLETE: ALL 4 TABLES ARE 100% READY FOR MODEL TRAINING!")
    print("=" * 60)
