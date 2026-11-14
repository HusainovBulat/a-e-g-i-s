# Technical Specification & Build Plan: Project A.E.G.I.S.
**Autonomous EVA Gait, Ischemia & Survival System · NASA Space Apps Challenge 2026 (November 14–15)**

* **Official Challenge Page:** [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
* **Official Video Briefing by the Challenge Author (Rodrigo Leonardi, Brazilian Space Agency):** [2026 Challenge Video Briefing (YouTube)](https://youtu.be/RERG3gEmdC8)
* **Team Role Distribution:**
  * **Kostya (AI / Data Science & Core Architecture):** real NASA/PhysioNet data pipeline, unified `0..10` and `0..100` scale normalization, LRO LOLA route cutting (`route_profile.json`), generating `scenarios.json` and `crew_history.json` from real datasets, `Mismatch & Readiness` logic, and `RAG-LLM (temperature=0.0)` grounded in `NASA-STD-3001` with instant deterministic template fallback.
  * **Giorgi (ML Engineer — paired with Kostya on Core Engine):** training, validating, and exporting deterministic machine learning models `Model A` (+ `Fallback`), `Model B`, and the `Model C (Triage)` Decision Tree using real clinical tables.
  * **Bulat (Backend Developer — Python FastAPI + WebSockets):** local Base server, WebSocket hub (`WS /ws/sensors` and `WS /ws/console`), REST endpoints (`/triage`, `/evening`, `/summary`, `/events`), integrating the ML models and mathematical core.
  * **Yarik (Frontend Developer — Next.js Console + Phone Web Sensor Sim):** Base Console (3 tabs `Mode 1–3` + clickable SVG astronaut body map + watch/visor mirror popup), QR-code phone sensor simulator web page (with hardware fall and tilt gyroscope detection), and voice input/output (`Web Speech API`).
  * **Chris (Pitch Deck & Medical Content):** plain-language medical copy in `content.json` and `thresholds.json`, presentation slides, and demo video editing.

---

## 1. System Architecture (`How the System Works`)

We completely eliminate native mobile app development (no Android Studio or APK builds). The entire product runs **100% in a standard web browser** over a single local network (hosted via the laptop's Wi-Fi hotspot on stage, guaranteeing zero dependency on venue internet).

The system consists of **4 connected components**:

```
[1. PHONE WEB SENSOR SIMULATOR]              [2. BASE SERVER (Laptop)]                 [3. BASE CONSOLE (Main Screen)]
Opened via QR code in browser:               FastAPI + Python ML Engine:               Next.js Web Dashboard:
• 6 scenario keys (Chest pain,               • WS /ws/sensors (1 Hz stream)            • Top bar: 5 environments + Routine Prompts
  Fall in crater, Steep climb,               • Runs Model A and Model B live           • Clickable SVG Body Map (6 organ zones)
  Tired says fine, Normal, Reset)    1 Hz    • POST /triage (Model C + hard            • Tab 1: Mode 1 (EVA + Forearm Watch &
• Live metric sliders              ──────►     nitroglycerin safety rules)     ──────►   Top-Right AR Visor Mirror Popup)
• Real phone motion gyroscope:               • POST /evening (Mismatch + Readiness     • Tab 2: Mode 2 (Emergency Triage,
  - Shake/Drop = Fall Event                    + tomorrow's fatigue forecast)            4 symptom recognizer cards, voice, kit)
  - Phone Tilt = Crater Slope                • POST /summary (RAG-LLM temp=0 +         • Tab 3: Mode 3 (5-step check-in, Mismatch,
• Toggles: NIRS fogged, Dizzy                  NASA-STD-3001 template fallback)          quests, 14-day OSDR trends, Commander)
```

* **Key Live Demo Moment:** On stage, a phone running the QR-linked web sensor simulator is handed directly to a judge. When the judge taps **`Chest pain`** on the phone (or shakes/drops the phone to simulate a fall inside a lunar crater), the server runs instant triage, and the big projector screen **automatically jumps to the red `Emergency` tab and speaks the emergency protocol aloud**.
* **Unified Scale Standard Across All Screens:**
  * All manual self-assessment sliders for the astronaut run strictly from **`0` to `10`**.
  * All objective organ health, fatigue, and readiness indices run strictly from **`0` to `100`** (`80–100` 🟢 Green Nominal, `60–79` 🟡 Amber Caution, `0–59` 🔴 Red Critical).

---

## 2. Screens & Visual Modules (`Screens`)

### 2.1. Interactive Clickable Astronaut Body Map with Animations (`Clickable Astronaut Body Map`)
The web dashboard features an interactive vector human figure with CSS animations (heart pulsing at the live `HR` frequency, chest expanding with respiration, and color-coded zones scaled `0` to `100`). Each of the **6 body zones/systems** is clickable and opens a plain-language card for non-doctors displaying:
1. **Biological Function (`Its Function`):** a concise explanation of what the organ/system does.
2. **Spaceflight Measurement Method (`Which measurements can be performed in space?`):** which onboard instrument captures the metric without hospital MRI/CT scanners.
3. **Current Health Status (`0..100 Score` + Traffic Light `🟢/🟡/🔴`)** and the impact of the 5 spaceflight hazards:

| Clickable Body Zone | Biological Function (`Its Function`) & NASA Challenge Hazard | Metrics & Spaceflight Measurement Method (`Space Measurements`) |
| :--- | :--- | :--- |
| **1. 🧠 Head, Brain & Mental Health**<br>*(Behavioral Health & CNS)* | **Function:** Motor coordination, balance, cognitive speed, sleep regulation, and emotional resilience.<br>**NASA Hazard:** `Behavioral health conditions` (isolation, confinement, circadian disruption). | **CNS & Behavioral Score (`0..100`):** `daily sleep hours`, `mood (0..10)`, gait micro-tremor (`IMU`), 10-sec cognitive reaction test (`PVT`), webcam eye-fatigue check (`camera image`), and optic nerve `POCUS ultrasound` (`ultrasound image` — SANS syndrome). |
| **2. 🫀 Heart & Vessels**<br>*(Cardiovascular System)* | **Function:** Pumping blood and delivering oxygen to the brain and tissues under altered gravity.<br>**NASA Hazard:** `Cardiovascular events` (orthostatic syncope, arrhythmia, radiation myocardial ischemia per [NASA OSDR OSD-435](https://osdr.nasa.gov/bio/repo/data/studies/OSD-435)). | **Cardiac Score (`0..100`):** `heart rate` (bpm), `blood pressure` (mmHg), 3-lead ECG (`ST-segment`, `HRV`) from the `Smart Base-Layer` shirt, and cardiac/carotid `POCUS ultrasound`. |
| **3. 🫁 Lungs & Gas Exchange**<br>*(Respiratory & CO₂)* | **Function:** Blood oxygenation and carbon dioxide clearance inside closed environments.<br>**NASA Hazard:** `Hostile closed environments` (localized CO₂ pockets inside the helmet or cabin). | **Respiratory Score (`0..100`):** blood oxygen saturation (`SpO2 %`), respiration rate via thoracic band, inspired CO₂ partial pressure, and remaining `Walk-Back Limit` time. |
| **4. 🛡️ Immune System & Thermoregulation**<br>*(Immune System)* | **Function:** Defense against pathogens, viral reactivation, and radiation-induced systemic inflammation.<br>**NASA Hazard:** `Immune system changes` & `Space radiation` (T-cell suppression from cosmic radiation and stress). | **Immune Score (`0..100`):** `body temperature` (°C), onboard radiation dosimeter reading, and inflammatory stress index (derived from resting HR, temperature, and capillary blood spot assay). |
| **5. 🍎 Nutrition & Metabolism**<br>*(Nutrition & Blood Sugar)* | **Function:** Supplying cellular energy (glucose), hydration, and electrolytes to prevent metabolic depletion.<br>**NASA Hazard:** `Inadequate nutrition` (caloric deficit, dehydration, glycemic swings). | **Metabolic Score (`0..100`):** **`blood sugar levels in mg/dL`** (via onboard capillary glucometer), hydration/electrolyte balance, and daily caloric intake (`0..10`). |
| **6. 🦵🦴 Leg Muscles & Skeleton**<br>*(Muscles & Bone Density)* | **Function:** Postural support, spacesuit locomotion, and calcium retention under gravitational unloading.<br>**NASA Hazard:** `Bone density loss` & `Altered gravity` (up to 1.5%/month bone loss and calf atrophy per [NASA OSDR OSD-783](https://osdr.nasa.gov/bio/repo/data/studies/OSD-783)). | **Musculoskeletal Score (`0..100`):** local muscle oxygenation (`NIRS SmO2`), fiber fatigue (`sEMG`), and 14-day cumulative axial bone impact load (`IMU axial bone load`). |

### 2.2. Summary Table of All 5 Application Screens

| Screen | Who Uses It | What It Displays | NASA Challenge Requirement Covered |
| :--- | :--- | :--- | :--- |
| **0. Top Bar & Astronaut Body Map (`Top Bar & Body Map`)** | All crew members and Commander | • 5-Environment Switcher: `Moon Base 1/6g` / `Crater EVA 1/6g` / `Rover 1/6g` / `Mars Transit 0g` / `Orbit Station μg` + baseline shift calculator (`Earth vs. Space Shift`).<br>• Periodic `Mission Routine Prompts` bell (reminding crew when to measure blood sugar/BP or hydrate).<br>• Clickable 6-zone SVG human figure (Table 2.1). | • *Objectives:* clickable human figure showing organ function and health status; how spaceflight hazards affect indicators.<br>• *Considerations:* 5 mission environments + periodic mission routine prompts. |
| **1. Console · Crater Walk (`Mode 1 · EVA Early Warning`)** | Commander at base & astronaut (via visor mirror) | • Dynamic `Walk-Back Limit` countdown (`04:52 Margin is short`).<br>• `MUSCLES · MODEL A` panel (`Legs fail in ~11 min`, fatigue score `77/100`, calf oxygen `SmO2 49%`, `sEMG` shift `-25%`, gait wobble `0.21` + `NIRS fogged` mode).<br>• `OXYGEN · MODEL B` panel (`O2 left 35%`, burn rate `1.9 L/min`, effort `482 W`).<br>• `LRO LOLA` route elevation profile (`1.8 / 2.6 km`, slope `+18°`).<br>• `WHAT'S HAPPENING` / `WHY IT MATTERS` cards and `Send instruction to Crew A's visor` (`Stop 60 s, then climb 30% slower`). | • *Objectives:* what actions can be taken to prevent a critical health condition.<br>• *Considerations:* color coding at a glance, dynamic charts over time, simple instructions and risk explanations. |
| **2. Popup · Forearm Watch & AR Visor (`Visor + Wrist Popup`)** | Suited astronaut during EVA | • **Top-Right Helmet AR Visor Corner:** 1 compact line with traffic light, timer, and partner radar arrow (`🟢/🟡/🔴 04:52 · STOP 60 S · ↗ 34 M`). Non-essential text dims automatically when `Dizzy` is active.<br>• **Forearm Cuff Display ("Watch"):** large metrics, 30-sec false-positive override countdown, 3 glove-friendly keys (`OK`, `Light`, `SOS`), and status of the 4 automated suit resuscitation systems (helmet CO₂ flush, `+10 °C` Peltier cold shock, `FES` calf compression, `UHF/UWB` beacon). | • Prevents syncope and resuscitates inside lunar crater radio shadows, overcoming the 5–10 min helmet CO₂ sensor lag ([NASA OCHMO-TB-004](https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/)). |
| **3. Console · Emergency Triage (`Mode 2 · Emergency`)** | Any crew member (not a doctor!) during a crewmate emergency | • **4 Visual `Guided Symptom Recognizer` Cards:** tells a non-doctor helper exactly what to check visually (Consciousness/eyes, Cold sweat/blue lips, Hands clutching chest, Leg tremors/spasms) + `Hold to speak` mic button with live keyword highlighting.<br>• **`[📷 Attach POCUS Cardiac Ultrasound / Camera Image]`** button.<br>• `Model C` Decision Tree verdict: primary diagnosis + ruled-out list + one-line `Why (Tree Path)`.<br>• High-visibility **`⛔ DON'T GIVE NITROGLYCERIN (BP 82/50 < 90 mmHg)`** banner + spoken audio guidance.<br>• 3 illustrated first-aid steps with SVG diagrams (30° leg wedge pose, medical bay `Drawer B2`, `AED` pad placement).<br>• Red escalation badge: **`📡 Queued for Flight Surgeons on Earth`**. | • *Author Video Briefing (00:44):* sudden sharp chest pain and collapse halfway to Mars; astronauts are not doctors.<br>• *Objectives:* multimodal input (keyboard, mouse clicks, camera/ultrasound images); when a result warrants attention from the crew vs. `flight surgeons on the ground`. |
| **4. Console · Evening Check-In & Commander (`Mode 3 · Evening`)** | Each astronaut first, then Mission Commander | • **5-Step Check-In Flow:** 1 question per step on a `0..10` scale (Sleep, Energy, Mood/Isolation, Pain-Free, Nutrition/Hydration) + exact fields for **`Blood Sugar (mg/dL)`**, **`BP (mmHg)`**, **`Body Temp (°C)`**, each paired with `📏 How to measure` and `⚠️ Why it matters` cards.<br>• **Result Screen:** `EVA Readiness Score (0..100)`, **`🟡 Mismatch Detected`** alert line (when self-reported energy `>= 7/10` while objective muscle fatigue `>= 70/100` or CNS tremor `>= +2 SD`).<br>• **3 Recovery Quests** (`+15 / +18 / +20 pts`) filling the `Readiness` bar to green (`>= 85`).<br>• **Two Charts:** Tomorrow's fatigue forecast (`Skip recovery vs Complete quests`) and 14-day history (calf O₂, bone load, tremor, sleep labeled `Source: NASA OSDR OSD-783 / OSD-435`).<br>• **Commander Panel:** `RAG-LLM (temp=0)` briefing per `NASA-STD-3001` and `[✅ Approve Schedule Swap]` / `[📡 Send to Flight Surgeons]` buttons. | • *Considerations:* gamification system, dynamic charts, color coding, simple instructions.<br>• *Author Video Briefing (01:58):* grounded in **[NASA OSDR](https://osdr.nasa.gov/bio/repo)** spaceflight biology data. |
| **5. Phone · Web Sensor Simulator (`Phone · Sensor Simulator`)** | Demo operator or Judge in the audience (via QR code) | • Crew selector (`Crew A / B / C / D`).<br>• 6 preset scenario keys (`Normal walk`, `Steep climb`, `Fall in crater`, `Chest pain`, `Tired, says fine`, `Reset all`).<br>• Live override sliders (`HR`, `BP sys/dia`, `SpO2`, `Slope`, `Calf SmO2`, `Blood Sugar mg/dL`, `Temp`).<br>• `NIRS fogged` and `Dizzy` toggles + real phone gyroscope fall & tilt detection. | Powers the interactive live stage demonstration with zero internet required. |

---

## 3. Data Map & Real Dataset Integration (`Data Map`)

**Mandatory Data Rule:** To earn full marks in Global Judging (*Validity* and *Use of NASA Open Data*), all models are trained and calibrated on **11 real open datasets from NASA and PhysioNet**. An offline Python preparation script normalizes these real sources and outputs **9 clean runtime files** (with a fixed random seed so rehearsals and live demos are 100% deterministic):

| Runtime Output File | Real Primary Data Source (NASA / PhysioNet / Figshare) | Where Computed & Where Displayed | Owner |
| :--- | :--- | :--- | :--- |
| **1. `route_profile.json`**<br>*(~100 elevation & slope points along Shackleton Crater Rim)* | Extracted via Python directly from NASA **[LRO LOLA Site04 (Shackleton Rim)](https://pgda.gsfc.nasa.gov/products/78)** 5 m/pixel GeoTIFFs: `Site04_final_adj_5mpp_surf.tif` (elevation in m) and `Site04_final_adj_5mpp_slp.tif` (true slope in degrees from `0°` to `+22°`). | Consumed by `Model B` on the backend; plotted on the `Mode 1 (EVA)` route profile and `Mode 3` forecast. | **Kostya + Giorgi** (`ML/data`) |
| **2. `scenarios.json`**<br>*(6 phone scenarios + 60-sec vital series for each)* | Normalized time series from real clinical archives:<br>• `Normal walk` & `Steep climb`: `SmO2/EMG` curves from **`PLOS ONE_dataset.xlsx`** ([NIH/Figshare](https://figshare.com/articles/dataset/Effects_of_hyperoxia_on_dynamic_muscular_endurance_are_associated_with_individual_whole-body_endurance_capacity/12073314)) + `sEMG` from **`semg-1.0.1.zip`** ([PhysioNet](https://physionet.org/content/semg/)) + `VO2/HR` from **`treadmill-exercise-cardioresp-1.0.1.zip`**.<br>• `Chest pain` & `Fall in crater`: real `BP`, `SpO2`, `HR`, and `ECG ST` drops from **`bidmc-ppg-and-respiration-dataset-1.0.0.zip`** and **`pulse-transit-time-ppg-1.0.0.zip`**. | Streamed from the phone at 1 Hz (`WS /ws/sensors`) → processed on backend → displayed across all screens. | **Kostya + Giorgi** (`ML/data`) |
| **3. `triage_train.csv` + `model_c_triage.pkl`**<br>*(Training set & 5-class Decision Tree)* | Built from real `HR`, `Systolic/Diastolic BP`, `SpO2`, `Respiration Rate`, and `Temp` distributions in **`bidmc-ppg-and-respiration-dataset-1.0.0.zip`** ([PhysioNet BIDMC](https://physionet.org/content/bidmc/)) and **`pulse-transit-time-ppg-1.0.0.zip`** ([PhysioNet PTT](https://physionet.org/content/pulse-transit-time-ppg/1.0.0/csv/)) across 5 classes (`Nominal`, `Acute Coronary Ischemia`, `Orthostatic Syncope`, `Hypercapnia CO2`, `Decompression Barotrauma`). | Trained in `scikit-learn` (`DecisionTreeClassifier`, depth 4–5); runs in `POST /triage` on backend. | **Giorgi + Kostya** (`ML/data`) |
| **4. `crew_history.json`**<br>*(14 sols × 4 crew: calf O₂, bone load, tremor, sleep, blood sugar `mg/dL`, immune)* | Calibrated on real spaceflight unloading studies from **[NASA OSDR OSD-783](https://osdr.nasa.gov/bio/repo/data/studies/OSD-783)** (`OSD-783_metadata_OSD-783-ISA.zip` — soleus muscle unloading & electrical myostimulation) and **[NASA OSDR OSD-435](https://osdr.nasa.gov/bio/repo/data/studies/OSD-435)** (`OSD-435_metadata_OSD-435-ISA.zip` — space radiation cardiac remodeling & echocardiography ultrasound). | Served via `GET /crew/{id}/history`; plotted on the 14-day charts in `Mode 3` and the 6 zones of the Body Map. | **Kostya** (`ML/data`) |
| **5. `model_a_full.pkl`, `model_a_fallback.pkl`, `model_b_metabolic.pkl`** | • `Model A` trained on **`PLOS ONE_dataset.xlsx`** + **`semg-1.0.1.zip`**.<br>• `Model B` trained on **`treadmill-exercise-cardioresp-1.0.1.zip`** ([PhysioNet Treadmill](https://physionet.org/content/treadmill-exercise-cardioresp/)) + **`actes-cycloergometer-exercise-1.0.0.zip`** ([PhysioNet ACTES](https://physionet.org/content/actes-cycloergometer-exercise/)) scaled to `1/6 g` lunar gravity per **`20170007261.pdf`** ([Apollo EVA](https://ntrs.nasa.gov/api/citations/20170007261/downloads/20170007261.pdf)) and **`Schlotman_IEEEaero2023_LunarMRandHR.pdf`** ([Lunar EVA 2023](https://ntrs.nasa.gov/api/citations/20230002653/downloads/Schlotman_IEEEaero2023_LunarMRandHR.pdf?attachment=true)). | Executed live on the backend for every incoming `WS /ws/sensors` packet. | **Giorgi + Kostya** (`ML/data`) |
| **6. `thresholds.json`**<br>*(Normal ranges for 5 environments, 15/30 min bands, `BP < 90` & `SpO2 < 92` rules, `750 L` suit O₂)* | Extracted from **`Human Health and Performance.pdf`** ([NASA-STD-3001 Vol. 1 & 2](https://ntrs.nasa.gov/api/citations/20230015521/downloads/Human%20Health%20and%20Performance.pdf)) and [NASA OCHMO-TB-004](https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/). | Single source of truth for thresholds across the entire codebase. | **Chris + Kostya** (`Pitch / ML`) |
| **7. `content.json`**<br>*(6 organ texts, 4 protocols × 3 kit steps, 5 `How/Why` cards, 3 quests, templates)* | Authored in plain non-doctor language grounded in `Human Health and Performance.pdf (NASA-STD-3001)`. | Displayed across all console tabs and the visor/watch popup. | **Chris** (`Pitch/medical`) |
| **8. `nasa_std_3001_excerpts.json` + `RAG-LLM` Prompt** | 6 verbatim excerpts from **`Human Health and Performance.pdf`** covering EVA metabolic limits, fatigue, and cardiac safety rules. | Passed to `POST /summary` into `RAG-LLM (temperature=0.0)` alongside the evening JSON (with instant template fallback if > 4 sec). | **Kostya** (`AI/DS`) |
| **9. SVG Illustrations (`Body Map` + `Medical Kit & AED`)** | 1) Interactive 6-zone SVG astronaut body figure.<br>2) SVG diagrams for the 30° leg wedge pose, `Bay B1/B2` cabinet locations, and `AED` pad placement. | Embedded in `Mode 3` / `Overview` and `Mode 2 (Emergency)` step cards. | **Yarik** (`Frontend`) |

---

## 4. Backend Mathematical Logic & Formulas (`Logic and Formulas`)

Every calculation lives **once, on the Python backend**. The frontend never recomputes numbers, guaranteeing that the phone, console, and demo video never disagree.

### 4.1. `Model A` — Muscular Exhaustion & Time to Leg Failure (`Mode 1` & `Mode 3` Forecast)
* Takes 4 normalized inputs from the Smart Base-Layer: `calf_smo2_pct` drop, desaturation rate `nirs_desat_slope`, median frequency shift `semg_mdf_shift_pct`, and `imu_gait_wobble` (trained regressor on `PLOS ONE_dataset.xlsx` + `semg-1.0.1.zip`, automatically switching to `model_a_fallback` without `NIRS` channels when `NIRS fogged` is active).
* Outputs the normalized **`Muscle Fatigue Score (0..100)`**.
* Time to leg cramping/failure formula:
  `Legs fail in (min) = (90 - Fatigue Score_now) / (Rate of Fatigue Rise over the last 5 min)`
* The same projection powers the two dashed tomorrow forecast curves in `Mode 3 (Evening)` (`Tomorrow's Fatigue Forecast`: starting from unrecovered fatigue vs. after completing the 3 evening quests).

### 4.2. `Model B` — Metabolic Rate, Oxygen Burn & Dynamic `Walk-Back Limit`
* Metabolic rate (`metabolic_rate_watts`, W) is predicted by `Model B` (trained on `treadmill-exercise-cardioresp` and `actes-cycloergometer` and calibrated via the Pandolf equation scaled to `1/6 g` lunar gravity and `AxEMU` suit mass) from `slope_deg`, `speed_kmh`, and current `Model A` fatigue:
  * Verified by 3 mandatory NASA benchmark unit tests: flat `0°` walking lands within `~185–310 W` ([Apollo 14–16 EVA report](https://ntrs.nasa.gov/api/citations/20170007261/downloads/20170007261.pdf)); steep `18°–30%` climb peaks at `~480–550 W` ([2023 NASA Simulated Lunar EVA](https://ntrs.nasa.gov/api/citations/20230002653/downloads/Schlotman_IEEEaero2023_LunarMRandHR.pdf?attachment=true)).
* Oxygen burn rate (`o2_burn_rate_l_min`, L/min) at 20 kJ per liter of O₂:
  `O₂ burn (L/min) ≈ (Metabolic Rate (W) / 335) × (1 + 0.25 × Fatigue Index)`
* Remaining minutes to the **Point of No Return (`Walk-Back Limit`, min)**:
  `t_walk_back = (O₂_left - O₂_reserve (45 L) - O₂_return (downhill return burn with current fatigue)) / O₂_burn_now`

### 4.3. `Model C` — Emergency Triage Decision Tree + Hard Safety Rules (`Mode 2`)
* A `scikit-learn` Decision Tree (`DecisionTreeClassifier`, depth 4–5, trained on `triage_train.csv` from `BIDMC` and `PTT PPG`) outputs the primary diagnosis class, the ranked remaining classes, and a **one-line `Tree Path ("Why")`** string for judges (e.g., `ST depression -2.1 mm + Chest Pain + Cold Sweat → Acute Coronary Ischemia`).
* **Hard Clinical Safety Rules (`Hard Rules`) always run after the tree and override everything:**
  1. If `systolic_bp < 90 mmHg` → forces the red **`⛔ DON'T GIVE NITROGLYCERIN`** contraindication banner.
  2. If `spo2 < 92%` → prepends `Apply 100% O₂ mask at 4 L/min` as Step 1.
  3. If primary class = `Acute Coronary Ischemia` or `Readiness < 50` → sets **`flight_surgeons_alert = True`** (`📡 Queued for Flight Surgeons on Earth`).

### 4.4. Biometric Mismatch Detector (`Mismatch`) & Readiness Formula (`Readiness 0..100` in `Mode 3`)
* **`Mismatch` Trigger Rule (`Tired, says fine`):** fires when self-reported energy on the slider is `energy_slider >= 7` (`>= 70/100`), while objective daytime muscle fatigue is `fatigue_score >= 70` or flat-floor CNS gait tremor is `tremor_zscore >= +2.0 SD`.
* **`EVA Readiness Score (0..100)` Formula:**
  `Readiness = min(100, max(0, 100 - Penalty_fatigue - Penalty_tremor - Penalty_sleep - Penalty_hydration_sugar - Penalty_mismatch + Bonus_quests))`
  where the 3 evening recovery quests grant **`+15`**, **`+18`**, and **`+20`** points. Traffic-light thresholds: **`>= 85` — 🟢 CLEARED**, **`60–84` — 🟡 CAUTION / RE-CHECK (Crew Attention)**, **`< 60` — 🔴 PROHIBITED (Schedule Swap + Flight Surgeons Escalation)**.

---

## 5. API & WebSocket Specification: Backend (`FastAPI` — Bulat) vs. Frontend (`Next.js` — Yarik)

State is kept in memory on the server (`in-memory state`: one object per crew member `Crew A..D` plus `event_log`). No external database is required — local network round-trips take milliseconds.

| Channel / Endpoint | Direction | Payload (Input → Output) |
| :--- | :--- | :--- |
| **`WS /ws/sensors`** | Phone (or simulator overlay) → Server (1 Hz) | `{crew, t, env, hr, sys, dia, spo2, resp, st, temp, blood_sugar_mgdl, smo2, emg_mdf, gait, slope, speed, o2_left, fall, nirs_ok, dizzy}` |
| **`WS /ws/console`** | Server → All open console screens & visor popup | Latest state per crew member (`0..100` scores for all 6 body zones, `Model A` & `Model B` outputs, `walk_back_min`, traffic light) + events (`alarm_jump_to_emergency`, `visor_instruction`, `ack`, `commander_decision`, `routine_prompt`). |
| **`POST /triage`** | Console (`Mode 2`) → Server | **Input:** live `vitals` + `symptom_flags` (from voice `Keyword Matcher` or clicks on the 4 `Guided Symptom Recognizer` cards) + optional `ultrasound_attached`.<br>**Output:** `primary_class`, `ranked_other_classes`, `tree_path_why`, `dont_give_list` (nitroglycerin block), `protocol_steps`, `flight_surgeons_queued`. |
| **`POST /evening`** | Console (`Mode 3`) → Server | **Input:** 5 sliders `0..10` (`sleep`, `energy`, `mood`, `pain_free`, `nutrition`), exact fields `blood_sugar_mgdl`, `bp`, `temp`, and `completed_quests` array.<br>**Output:** `readiness_score (0..100)`, `band (green/amber/red)`, `mismatch_detected`, `mismatch_text`, `forecast_curve_no_rest`, `forecast_curve_with_quests`, `organ_scores_6`. |
| **`POST /summary`** | Console (`Mode 3`) → Server | **Input:** evening check-in result JSON.<br>**Output:** natural-language Commander briefing and schedule swap proposal from `RAG-LLM (temperature=0.0)` citing `NASA-STD-3001` (or instant template fallback if > 4 sec or offline). |
| **`GET /scenarios`, `GET /crew/{id}/history`** | Console → Server | Returns initial demo datasets (`scenarios.json`, 14-day `crew_history.json` grounded in `NASA OSDR`, crater `route_profile.json` from `LRO LOLA`). |
| **`POST /events`** | Console or Phone → Server | Wrist `OK` tap (30-sec alarm cancel), `Send to Crew A's visor`, Commander `Approve Swap` → appends to `event_log` timeline (e.g., `"21:13 Nitroglycerin blocked (BP 82/50)"`). |

---

## 6. Live Demo Technical Features (`Features That Really Work`)

All features run in a standard browser with no extra hardware:

1. **Hold to Speak with Live Symptom Highlighting (`Hold to speak, live transcript` — Must):** Chrome `Web Speech API`; symptom keywords light up on the 4 recognizer cards as the rescuer speaks (with a permanently visible text input and clickable symptom tags as a 100% offline fallback).
2. **Spoken First-Aid Instructions (`Steps read aloud` — Must):** browser `speechSynthesis` reads the nitroglycerin warning and medical kit steps aloud so the rescuer's hands remain free.
3. **Real Phone Fall Detection & Tilt-as-Slope (`Real fall detection & Phone tilt as slope` — Must/Should):** a sharp drop or shake of the phone in a judge's hand fires `fall=True` and starts the 30-second red countdown; tilting the phone adjusts the crater slope angle live.
   * ⚠️ **iOS Safari Setup Note (test Friday night):** iOS Safari only exposes motion/orientation events over **`HTTPS`** after tapping an `Enable motion` button. Serve the sensor page over HTTPS on the laptop hotspot using a local `mkcert` certificate and `wss://` for the WebSocket.
4. **One-Click QR Pairing (`QR pairing` — Should):** the console displays a QR code pointing to the laptop hotspot URL for the phone sensor page.

---

## 7. Weekend Hour-by-Hour Build Plan (`Build Plan: Friday — Sunday`)

### 🌙 Friday Night (Pre-Hackathon Setup)
* [ ] Verify local HTTPS (`mkcert` + `wss://`) and iPhone motion events over the laptop Wi-Fi hotspot.
* [ ] Lock in the WebSocket and REST JSON payloads from Section 5 across Bulat, Yarik, Kostya, and Giorgi.

### ☀️ Saturday — First 4 Hours (Morning)
* [ ] **Bulat (`Backend`):** initialize repo, stand up `FastAPI` and the `WebSocket` hub (`WS /ws/sensors` and `WS /ws/console`) broadcasting initial state packets over the local network.
* [ ] **Yarik (`Frontend`):** stand up the `Next.js` console shell with top bar (5 environments + routine prompts), in-console sensor simulator overlay, and the phone sensor web page.
* [ ] **Kostya + Giorgi (`ML/data`):** run the normalization script over the real archives (`LRO LOLA Site04`, `PhysioNet`, `Figshare`, `OSDR`) and output `route_profile.json`, `scenarios.json` v1, and `thresholds.json`.
* [ ] **Chris (`Pitch`):** draft `content.json` v1 (6 organ descriptions, 4 medical kit protocols, `How/Why` cards) and the video script outline.

### 🔥 Saturday — Afternoon to Night (Target by Saturday Night: `Mode 1` & `Mode 2` working end-to-end with the phone)
* [ ] **Kostya + Giorgi (`ML/data`):** train and export `Model A` (+ `Fallback`), `Model B` (passing the 3 unit tests at `0° / 10° / 18°` against NASA Apollo/2023 ranges), and the `Model C` Decision Tree on `triage_train.csv` (passing all 4 demo scenarios).
* [ ] **Bulat (`Backend`):** wire Kostya and Giorgi's models into `WS /ws/sensors` and implement `POST /triage` with the hard nitroglycerin (`BP < 90`) and oxygen (`SpO2 < 92`) safety rules.
* [ ] **Yarik (`Frontend`):** complete the **Mode 2 (Emergency)** tab (auto-jump on phone trigger, 4 visual symptom recognizer cards + mic input, spoken steps, medical kit/AED SVGs, `Flight Surgeons` badge) and **Mode 1 (EVA)** tab with the visor/wrist mirror popup.
* [ ] **Chris (`Pitch`):** review all medical copy and compile the NASA data sources citation list for the project page.

### 🌅 Sunday — Until 12:00 Noon (`Feature Freeze` at 12:00 Noon)
* [ ] **Yarik (`Frontend`):** complete **Mode 3 (Evening)** featuring the interactive **clickable 6-zone SVG Astronaut Body Map**, the 5-step check-in flow (`0..10` sliders + `Blood Sugar mg/dL`, `BP`, `Temp` fields + `How/Why` cards), and the result board (`Mismatch` banner, 3 recovery quests, 14-day chart labeled `Source: NASA OSDR`, tomorrow's forecast, and Commander buttons).
* [ ] **Bulat + Kostya (`Backend + AI`):** connect `POST /evening` (`Mismatch & Readiness` formula + tomorrow's forecast curves) and `POST /summary` (`RAG-LLM` at `temperature=0.0` with `NASA-STD-3001` excerpts + instant template fallback).
* [ ] **All Team:** full dress rehearsal with the phone and venue Wi-Fi turned off. **12:00 Noon — Feature Freeze.**

### 🏆 Sunday — Afternoon (Video Recording, Cloud Deploy & Final Submission)
* [ ] Deploy a public cloud instance (so Global Judges can click and test the live URL in their browser), while keeping the local hotspot build for the Tbilisi stage pitch.
* [ ] Record screen captures and cut the demo video (opening directly with the sudden chest-pain scenario from the NASA video briefing).
* [ ] Complete the `spaceappschallenge.org` project submission page (description, NASA data sources, Earth impact section, `SI / AI Disclosure`, GitHub and Live Demo links) and **submit at least 2 hours before the deadline**.

---

## 8. Ready-to-Use Submission Blocks (Judging Criteria, Earth Impact & 2026 SI Disclosure)

### 8.1. Alignment with the 5 Official NASA Judging Criteria (`How We Score`)
* **Relevance:** Opens directly on the exact case from the challenge author's briefing (sudden chest pain halfway to Mars / on the Moon, no doctor on board, comms delay). Explicitly displays and cites `NASA OSDR (OSD-783, OSD-435)`, `NASA LRO LOLA Site04`, `Apollo EVA NTRS`, and `NASA-STD-3001` on screen.
* **Validity:** Life-safety decisions are governed by deterministic models and hard clinical rules, never unguarded LLM hallucinations. Every threshold and constant traces back to NASA and PhysioNet files.
* **Impact:** Operates with zero link to Earth, guides a non-doctor step by step with voice and diagrams, catches masked fatigue (`Mismatch`) before an EVA, and translates directly to remote healthcare on Earth.
* **Creativity:** A judge in the room holds the phone sensor simulator, taps `Chest pain` or shakes the phone, and watches the big screen react instantaneously; combines a clickable human body map with biometric mismatch detection.
* **Presentation:** Live offline stage demo + crisp video opening with the Mars chest-pain hook.

### 8.2. Earth Applications (`Earth Impact` — Addressing Timestamp `02:33` of Rodrigo Leonardi's Briefing)
In the official video briefing, challenge author Rodrigo Leonardi highlights that solutions should also inspire healthcare tools on Earth for remote communities with limited access to medical services (*"inspire healthcare tools here on Earth for remote communities or places with limited access to health services"*).
* **Ready-to-Use Copy for the Pitch Deck & Project Page:**
  1. **Remote Amazonian Villages, High-Altitude Communities & Polar Stations:** Where no cardiologist or hospital link is available, a local paramedic or community member uses `Mode 2 (Guided Symptom Recognizer + Deterministic Triage)` to rapidly differentiate acute cardiac ischemia from syncope or shock and follow safe, contraindicative-checked first-aid steps.
  2. **Search-and-Rescue Teams, Firefighters in SCBA Gear, Underground Miners & Commercial Divers:** `Mode 1 (Autonomous Stamina & Walk-Back Limit)` forecasts muscular exhaustion and breathing-apparatus oxygen point-of-no-return 15 minutes before collapse inside hazardous, radio-shadowed environments.

### 8.3. Mandatory 2026 Super Intelligence Disclosure (`SI / AI Disclosure` per Participant FAQs)
Per the 2026 NASA Space Apps Challenge rules (*What is Super Intelligence? Can teams utilize it during the hackathon?*), include the following disclosure on the project submission page:
* **Ready-to-Paste `SI / AI Disclosure` Text:**
  > *"In accordance with the 2026 NASA Space Apps Challenge guidelines on Super Intelligence (SI) disclosure: 1) Within the A.E.G.I.S. system architecture, all life-critical physiological monitoring, muscular exhaustion forecasting (Model A & B), and emergency chest-pain triage (Model C) are executed by 100% deterministic machine learning models (scikit-learn) trained on normalized physiological datasets and governed by hard clinical safety rules (NASA-STD-3001) to guarantee zero hallucinations in life-support loops. A Large Language Model (SI / RAG-LLM at temperature = 0.0 with an instant deterministic template fallback) is used strictly in Mode 3 to translate structured JSON telemetry and NASA-STD-3001 excerpts into human-readable shift-swap briefings for the Mission Commander. 2) During hackathon preparation and development, SI assistants (Claude and Gemini) were utilized for UI scaffolding, dataset normalization scripts, and documentation."*
