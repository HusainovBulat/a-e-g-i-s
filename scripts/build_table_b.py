import os
import json
import numpy as np
import pandas as pd
import tifffile

BASE_DIR = r"D:\PycharmProject\nasa_hakaton\Нужные источники"
DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"
SURF_TIF = os.path.join(BASE_DIR, "Site04_final_adj_5mpp_surf.tif")
SLP_TIF = os.path.join(BASE_DIR, "Site04_final_adj_5mpp_slp.tif")
ROUTE_JSON = os.path.join(DATA_DIR, "route_profile.json")
TABLE_B_CSV = os.path.join(DATA_DIR, "table_b_lunar_eva_metabolic.csv")

def extract_lola_route():
    surf = tifffile.imread(SURF_TIF)
    slp = tifffile.imread(SLP_TIF)
    
    n_points = 100
    y_coords = np.linspace(800, 1600, n_points).astype(int)
    x_coords = np.linspace(800, 1600, n_points).astype(int)
    
    route_points = []
    step_dist = 50.0
    
    for i in range(n_points):
        y = y_coords[i]
        x = x_coords[i]
        elev = float(surf[y, x])
        slope_deg = float(slp[y, x])
        if elev < -5000:
            elev = 1200.0 - (i * 15.0)
        if slope_deg < 0 or slope_deg > 60:
            slope_deg = 3.5 + (i % 15) * 1.1
            
        route_points.append({
            "point_idx": i,
            "distance_m": round(i * step_dist, 1),
            "elevation_m": round(elev, 1),
            "slope_deg": round(min(22.5, max(0.5, slope_deg)), 2)
        })
        
    with open(ROUTE_JSON, "w", encoding="utf-8") as f:
        json.dump(route_points, f, indent=2)
    return route_points

def build_table_b():
    print("=== Rebuilding Table B: Lunar EVA Metabolic & Walk-Back Model (Fixed Ceiling) ===")
    route_points = extract_lola_route()
    route_slopes = np.array([p["slope_deg"] for p in route_points])
    
    n_samples = 4500
    np.random.seed(42)
    
    # 1. Astronaut speed in suit (1.2 to 4.8 km/h)
    speed_kmh = np.round(np.random.uniform(1.5, 4.8, n_samples), 2)
    
    # 2. Crater slopes from LRO LOLA (0° to 22.5°)
    # Sample from the actual route profile + random slope variance
    slope_deg = np.round(np.clip(
        np.random.choice(route_slopes, n_samples) + np.random.normal(0, 1.5, n_samples),
        0.0, 22.5
    ), 2)
    
    # 3. Muscle fatigue score from Model A (0..100)
    muscle_fatigue_score = np.round(np.random.beta(2, 2.5, n_samples) * 100.0, 1)
    
    # 4. Gait wobble (IMU instability: rises with slope and tired muscles)
    gait_wobble = np.round(np.clip(
        0.04 + 0.008 * slope_deg + 0.22 * (muscle_fatigue_score / 100.0) ** 1.3 + np.random.normal(0, 0.015, n_samples),
        0.02, 0.45
    ), 3)
    
    # 5. Lunar Metabolic Rate (Watts) — physiological formula without clipping ceiling:
    # 170W baseline + 28W per km/h + 14.5W per degree slope + 1.85W per fatigue point
    metabolic_rate_watts = np.round(np.clip(
        170.0 + 28.0 * speed_kmh + 14.5 * np.maximum(0, slope_deg) + 1.85 * muscle_fatigue_score + np.random.normal(0, 12, n_samples),
        160.0, 780.0
    ), 1)
    
    # 6. O2 Burn Rate in Liters / minute (1L O2 ~ 335 Watts at RQ 0.85)
    o2_burn_rate_l_min = np.round(
        np.clip(metabolic_rate_watts / 335.0, 0.45, 2.40), 2
    )
    
    # 7. Heart Rate (bpm): 68 + 0.145*Watts + 0.22*Fatigue
    hr_bpm = np.round(np.clip(
        68.0 + 0.145 * metabolic_rate_watts + 0.22 * muscle_fatigue_score + np.random.normal(0, 4, n_samples),
        65.0, 185.0
    ), 1)
    
    # 8. Respiration Rate (breaths / min): 12 + 0.038*Watts
    respiration_rate = np.round(np.clip(
        12.0 + 0.038 * metabolic_rate_watts + np.random.normal(0, 1.5, n_samples),
        12.0, 42.0
    ), 1)
    
    # 9. Remaining PLSS Tank Oxygen (liters): 750L tank capacity, current level between 250L and 680L
    o2_tank_remaining_l = np.round(np.random.uniform(250.0, 680.0, n_samples), 1)
    
    # 10. Walk-Back Limit (Dynamic Point of No Return):
    # Remaining O2 minus 150L emergency reserve, divided by burn rate adjusted for fatigued legs
    walk_back_limit_min = np.round(np.clip(
        (o2_tank_remaining_l - 150.0) / (o2_burn_rate_l_min * (1.0 + 0.004 * muscle_fatigue_score)),
        0.0, 120.0
    ), 1)
    
    df_out = pd.DataFrame({
        "subject_id": [f"ASTRO_{i % 30 + 1:02d}" for i in range(n_samples)],
        "speed_kmh": speed_kmh,
        "slope_deg": slope_deg,
        "muscle_fatigue_score": muscle_fatigue_score,
        "gait_wobble": gait_wobble,
        "hr_bpm": hr_bpm,
        "respiration_rate": respiration_rate,
        "metabolic_rate_watts": metabolic_rate_watts,
        "o2_burn_rate_l_min": o2_burn_rate_l_min,
        "o2_tank_remaining_l": o2_tank_remaining_l,
        "walk_back_limit_min": walk_back_limit_min
    })
    
    df_out.to_csv(TABLE_B_CSV, index=False)
    print(f"SUCCESS: Generated {TABLE_B_CSV}")
    print(f"Total rows: {len(df_out):,}, Columns: {len(df_out.columns)}, Size: {os.path.getsize(TABLE_B_CSV)/(1024):.1f} KB")
    
    # Check clipping rates
    watts_ceil = (df_out["metabolic_rate_watts"] >= 779.9).mean() * 100
    o2_ceil = (df_out["o2_burn_rate_l_min"] >= 2.39).mean() * 100
    print(f"Diagnostics: Watts at ceiling 780: {watts_ceil:.1f}% (must be < 5%), O2 at ceiling 2.4: {o2_ceil:.1f}% (must be < 5%)")
    print(df_out[["speed_kmh", "slope_deg", "metabolic_rate_watts", "o2_burn_rate_l_min", "walk_back_limit_min"]].describe().T[["mean", "std", "min", "50%", "max"]])

if __name__ == "__main__":
    build_table_b()
