# A.E.G.I.S. Normalized Data Hub (`data/`)
**Autonomous EVA Gait, Ischemia & Survival System · NASA Space Apps Challenge 2026**

All raw physical datasets from NASA OSDR, MIT PhysioNet, NIH Figshare, and LRO LOLA have been normalized into clean, typed, zero-null CSV and JSON files strictly following the **0..10 / 0..100 System Directives**.

---

## 📁 File Manifest & ML Mapping

### 1. `table_a_myo_fatigue.csv` (Model A: Myo-Fatigue Regressor)
- **Sources:** `PLOS ONE_dataset.xlsx` (NIRS ΔO2Hb + sEMG) + `semg-1.0.1` (PhysioNet gastrocnemius & gait).
- **Rows:** 3,720 rows across 31 subjects.
- **Features:** `calf_smo2_pct`, `nirs_desat_slope`, `semg_rms_pct`, `semg_mdf_shift_pct`, `imu_gait_asymmetry`, `hr_bpm`.
- **Targets:**
  - `muscle_fatigue_score`: strictly **0..100** (0 = fresh, 100 = total exhaustion).
  - `time_to_failure_min`: predicted minutes to leg muscle failure (0 to 42 min).
- **Owner:** Georgiy (`model_a_full.pkl` and `model_a_fallback.pkl`).

### 2. `table_b_lunar_eva_metabolic.csv` (Model B: EVA Metabolic & Walk-Back)
- **Sources:** `test_measure.csv` (Treadmill 992 subjects) + `actes` (Cycloergometer) + `Site04 LOLA TIF` + Apollo EVA scaling (`20170007261.pdf`).
- **Rows:** 4,500 rows.
- **Features:** `speed_kmh` (1.2 to 5.0 km/h), `slope_deg` (0° to 22.5°), `muscle_fatigue_score` (0..100), `gait_wobble`, `hr_bpm`, `respiration_rate`.
- **Targets:**
  - `metabolic_rate_watts`: metabolic rate (160 to 780 W).
  - `o2_burn_rate_l_min`: oxygen burn rate (0.45 to 2.40 L/min).
  - `walk_back_limit_min`: Dynamic Point of No Return (minutes before PLSS tank 750 L is exhausted).
- **Owner:** Georgiy (`model_b_metabolic.pkl`).

### 3. `table_c_emergency_triage.csv` (Model C: Emergency Triage Decision Tree)
- **Sources:** `Pulse/pulse_features_1hz.csv` (PTT healthy cohort) + `ppg/bidmc` (ICU distress signals).
- **Rows:** 7,500 rows (**100% Balanced:** exactly 1,500 rows per class).
- **5 Classes:**
  - `0: Nominal`
  - `1: Acute Coronary Ischemia`
  - `2: Orthostatic Syncope`
  - `3: Hypercapnia CO2`
  - `4: Decompression Barotrauma`
- **Clinical Interlocks:**
  - `dont_give_nitro`: strictly `1` when `bp_sys < 90 mmHg` (549 cases in Ischemia, all 1500 cases in Syncope).
- **Owner:** Georgiy (`model_c_triage.pkl`) & Bulat (`POST /triage`).

### 4. `table_d_osdr_14day_trend.csv` (Longitudinal 14-Sol Trends)
- **Sources:** NASA OSDR `OSD-783` (soleus muscle unloading) + `OSD-435` (radiation cardiac remodeling).
- **Rows:** 56 rows (14 sols × 4 crew members: `Crew A, B, C, D`).
- **Features:** `calf_smo2_pct`, `cum_bone_load_g`, `sleep_hours`, `blood_sugar_mgdl` (strictly in `mg/dL`), `resting_hr_bpm`, `subjective_energy_slider` (0..10), `objective_sensor_score` (0..100).
- **Masking Detector:** `mismatch_detected = 1` triggered on Astronaut A (Sols 11–13) where subjective energy is high (8–9/10) despite objective exhaustion (score < 60).
- **Owner:** Kostya (Masking Detector & Consequence Simulator) & Bulat (`GET /crew/{id}/history`).

### 5. `route_profile.json`
- 100 elevation and slope points directly sampled from satellite GeoTIFFs (`LRO LOLA Site04 Shackleton Rim`).
- **Owner:** Yarik (Mode 1 & Mode 3 terrain graphs).

### 6. `thresholds.json` & `nasa_std_3001_excerpts.json`
- Master clinical thresholds and safety rules extracted from `NASA-STD-3001`.
- **Owner:** Bulat & Kostya (RAG-LLM temp=0.0).
