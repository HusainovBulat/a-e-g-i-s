# A.E.G.I.S. — Autonomous EVA Gait, Ischemia & Survival System

**NASA Space Apps Challenge 2026 · [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)**

[![tests](https://github.com/HusainovBulat/a-e-g-i-s/actions/workflows/tests.yml/badge.svg)](https://github.com/HusainovBulat/a-e-g-i-s/actions/workflows/tests.yml)

Offline health monitoring for a crew of four: a phone acts as the suit's sensor pack, a laptop runs the
Base Server (FastAPI + deterministic ML models) and a Next.js mission console. Everything runs in a browser on
one local network — no internet needed on stage. Full product spec: `Project Aegis Unified Master Plan En.markdown`
(RU: `Project_Aegis_Unified_Master_Plan_Ru.markdown`).

| Mode | What it does |
|---|---|
| **Body map** | 6 organ zones scored 0..100 (🟢 ≥ 80 · 🟡 60–79 · 🔴 < 60) with environment baseline shifts |
| **Mode 1 · EVA early warning** | Model A leg fatigue + time to failure, Model B metabolic rate / O₂ burn, dynamic walk-back limit, visor line |
| **Mode 2 · Emergency triage** | Model C diagnosis + hard clinical rules (nitroglycerin block at BP < 90, O₂ mask at SpO₂ < 92), spoken steps, auto-jump on phone alarms |
| **Mode 3 · Evening check-in** | 0..10 self-report vs objective telemetry (masking detector), EVA readiness, recovery quests, Commander briefing (RAG-LLM at temperature 0 + deterministic template) |

## ▶ One-click start

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (fallback: Python 3.11+ and Node.js 20+).
2. **Windows:** double-click `start.bat` · **macOS / Linux:** `./start.sh`
3. The console opens at http://localhost:3000 (API / Swagger: http://localhost:8000/docs). The script prints the phone URLs `http://<laptop-ip>:3000/phone`. Stop with `stop.bat` / `./stop.sh`.

Optional: put `GROQ_API_KEY=...` into `.env` (created from `.env.example` on first start) to let the Commander briefing use the LLM; without it (or if it takes > 4 s) the deterministic template answers instantly.

### ▶ HTTPS for the stage demo (iPhone fall / tilt sensors)

iOS Safari exposes motion sensors only on HTTPS pages. **Windows:** double-click `start-https.bat` · **macOS / Linux:** `./start.sh --https`

- installs [mkcert](https://github.com/FiloSottile/mkcert) if needed (winget), creates a local CA and a certificate for the laptop's current LAN IPs (+ `192.168.137.1`, the Windows Mobile Hotspot);
- a Caddy proxy (`deploy/Caddyfile`) serves console, phone page, `/api` and `/ws` from **one origin** on `https://<laptop-ip>/`; QR codes point to `https://<laptop-ip>/phone?crew=A`.

**iPhone, once per phone:** Safari → `http://<laptop-ip>/aegis-rootCA.crt` → Allow → Settings → *Profile Downloaded* → Install → Settings → General → About → *Certificate Trust Settings* → enable **mkcert**. Then open the phone page and tap *Enable motion*.
On a new network (venue Wi-Fi / hotspot) just run `start-https.bat` again: the certificate is re-issued for the new IPs, the iPhone keeps trusting the same CA.
The phone may also be on Wi-Fi while the laptop is on Ethernet, as long as both are in the same subnet (no guest network / AP isolation) and Windows Firewall allows inbound TCP 80, 443, 3000, 8000 on the private network.
Only the public root certificate is served over HTTP; `certs/` (with the private keys) is git-ignored.

## Project layout

```
app/                    Base Server (FastAPI)
  main.py               app factory, lifespan (loads data + models)
  api.py                REST + WebSocket routes (also mounted under /api)
  service.py            in-memory crew state, auto-triage, fall countdown, scenario player, events
  engine.py             live calculations for the console (Model A/B, walk-back, visor line, triage, evening)
  ml/models.py          Model A / A-fallback / B / C: loads models/*.pkl, else trains from data/*.csv (seed 42)
  ml/predict_all.py     single-call ML pipeline (POST /api/predict_all), see below
  hub.py                console broadcast hub
core_math.py            organ scores, masking detector, readiness, forecast, Mode 2 hard rules
rag_llm.py              Commander RAG-LLM (Groq, temperature 0) + deterministic template
predict_all.py          copy of app/ml/predict_all.py used by the root tests — keep both in sync
frontend/               Next.js console (/), phone sensor simulator (/phone), visor mirror (/visor)
data/                   normalized NASA / PhysioNet datasets (see data/README.md)
models/                 exported runtime models (*.pkl, LightGBM)
scripts/                dataset normalization + scripts/train_models.py (re-export models)
deploy/                 Caddyfile (HTTPS proxy), lan-ips.ps1 (laptop LAN addresses)
tests/                  backend tests · frontend/test/ — console tests
```

## ML models

| Model | File | Trained on | Output |
|---|---|---|---|
| **A** — myo-fatigue (+ fallback without NIRS) | `model_a_full.pkl`, `model_a_fallback.pkl` | PLOS ONE NIRS/sEMG + PhysioNet sEMG (`table_a`) | leg fatigue 0..100; time to failure = (90 − fatigue) / fatigue rise per min |
| **B** — metabolic | `model_b_metabolic.pkl` | PhysioNet treadmill + ACTES, scaled to 1/6 g (`table_b`) | metabolic rate W; O₂ burn = W / 335 × (1 + 0.25 × fatigue/100) |
| **C** — emergency triage | `model_c_triage.pkl` | BIDMC + PTT PPG distributions (`table_c`) | 5 classes + one-line `tree_path` explanation (LightGBM + surrogate decision tree) |

All models are monotonic / deterministic (seed 42). Model B is checked against NASA benchmarks: flat 0° ≈ 185–310 W (Apollo 14–16), 18° climb ≈ 480–550 W (2023 lunar EVA study).
Hard clinical rules always run after Model C and override it. Life-critical paths never depend on the LLM.

To use new exports, drop the four `.pkl` files into `models/` (bare estimator or `{"model": est, "features": [...]}`; features are matched by name). Without them the server trains the same models from `data/` at startup. Re-export with `python scripts/train_models.py`.

### `predict_all` — the whole pipeline in one call

`POST /api/predict_all` (or `from predict_all import predict_all`) runs Model A → B → C, the clinical rules, the 6 organ scores,
voice keyword extraction and the Mode 3 masking detector on one telemetry packet:

```python
from predict_all import predict_all

result = predict_all({
    "crew": "Crew_A", "distance_m": 1250, "speed": 2.5, "slope": 5, "o2_left": 580,
    "hr": 78, "sys": 118, "dia": 76, "spo2": 98.4, "resp": 15, "smo2": 78.5,
    "emg_mdf": -2, "gait": 0.12, "st": 0.005, "temp": 36.7, "blood_sugar_mgdl": 92,
    "transcript": "chest pain and short of breath",   # optional: voice symptoms (EN / RU)
    "sleep": 9, "energy": 9, "mood": 9, "pain_free": 9, "nutrition": 9,  # optional: Mode 3 sliders
})
result["health_score"], result["band"]              # 0..100, GREEN / YELLOW / RED
result["model_b"]["walk_back_limit_min"]             # minutes of forward travel left
result["model_c"]["primary_class"], result["model_c"]["dont_give_nitro"]
result["mode3_readiness"]["masking_detected"]
```

Keys accept common aliases (`hr`/`hr_bpm`, `sys`/`bp_sys`, `st`/`st_elevation_mv`, `o2_left`/`o2_tank_l`, …); missing values fall back to nominal defaults.
Run `python predict_all.py` for a standalone self-check.

Walk-back limit: return speed slows with fatigue (`max(1.2, 2.5 × (1 − 0.3 × fatigue/100))` km/h), the O₂ needed to walk back is reserved, and the rest is divided by the current burn rate (🟡 ≤ 15 min, 🔴 ≤ 5 min).

> **Known difference:** `predict_all` keeps a **45 L** O₂ reserve (Master Plan §4.2), while the live console (`app/engine.py`) uses **150 L** from `data/thresholds.json`. Pick one value before the demo so both report the same walk-back limit.

## Run without the scripts

```bash
# Docker
docker compose up -d --build                       # backend :8000 + console :3000
docker compose --profile https up -d --build       # + HTTPS proxy :443 (needs certs/ from mkcert)

# Locally
pip install -r requirements-dev.txt
python run.py                                      # http://0.0.0.0:8000, Swagger at /docs
cd frontend && npm ci && npm run dev               # http://localhost:3000
```

## WebSockets

All server → console messages: `{"type", "ts", "crew"?, "data"}`.

**`WS /ws/sensors`** (phone → server, 1 Hz). Each message is answered with `{"type":"ack"}` or `{"type":"error"}`.

| Message | Effect |
|---|---|
| `{crew, t, env, hr, sys, dia, spo2, resp, st, temp, blood_sugar_mgdl, smo2, emg_mdf, gait, slope, speed, o2_left, fall, nirs_ok, dizzy}` | telemetry; partial packets are merged (slider overrides) |
| `{"type":"scenario","scenario":"chest_pain","crew":"Crew_A"}` | server plays the 60-s scenario at 1 Hz (`reset_all` resets everyone) |
| `{"type":"override","crew":..,"values":{"slope":14}}` | sticky override on top of a playing scenario (tilt-as-slope) |
| `{"type":"fall","crew":..}` | gyroscope fall → 30 s wrist-OK countdown |
| `{"type":"stop","crew":..}` | stop scenario |

**`WS /ws/console`** (server → consoles/visor). On connect: `hello` `{crews, events, scenarios, environments, models}`. Then:

| type | when |
|---|---|
| `state` | every processed packet: vitals, `organ_scores` (6 zones, 0..100 + band), `model_a` (fatigue_score, legs_fail_in_min — `null` = stable), `model_b` (metabolic_rate_watts, o2_burn_rate_l_min, o2_left_pct), `walk_back` (minutes, display `mm:ss`, level), `route_position`, `traffic_light`, `alerts`, `visor`, `alarm`, `fall_countdown_s` |
| `alarm_jump_to_emergency` | fall / ST ≥ 0.1 mV / BP < 90 / SpO2 < 92 → contains the full `triage` result → console switches to Mode 2 |
| `fall_countdown`, `ack`, `sos_auto_escalated` | wrist countdown lifecycle |
| `triage_result`, `evening_result`, `commander_summary` | results of the REST calls (all screens stay in sync) |
| `visor_instruction`, `commander_decision`, `routine_prompt`, `event`, `reset` | timeline / prompts |

Consoles can send `{"type":"ping"}`, `{"type":"get_state"}`, `{"type":"event", "data":{…same as POST /events…}}` and the sensor messages above.

## REST

Every route is available both at `/<path>` and `/api/<path>`.

| Endpoint | Notes |
|---|---|
| `POST /triage` | `{crew, vitals{hr,sys,dia,spo2,resp,st,temp}, symptom_flags{chest_pain,dizzy,short_breath,cold_sweat,fall_event}, transcript?, ultrasound_attached?}` → `primary_class, ranked_other_classes, tree_path_why, dont_give_list, protocol_steps, flight_surgeons_queued, spoken_text`. Missing vitals come from live telemetry. |
| `POST /triage/keywords` | `{transcript}` → symptom flags (offline keyword matcher) |
| `POST /evening` | `{crew, sleep, energy, mood, pain_free, nutrition (0..10), blood_sugar_mgdl, bp:"118/76", temp, completed_quests:["hydration","compression","breathing"]}` → `readiness_score, band, mismatch_detected, mismatch_text, quests, readiness_if_all_quests, forecast_minutes, forecast_curve_no_rest, forecast_curve_with_quests, organ_scores_6, flight_surgeons_alert` |
| `POST /summary` | `{crew}` (uses the crew's last check-in) or a full evening result; `offline:true` forces the template → `commander_summary` (Markdown), `schedule_action`, `badge_text`, `recommended_crew`, `source`, `latency_ms` |
| `POST /predict_all` | one telemetry packet → full ML pipeline output (see above) |
| `POST /events` / `GET /events` | `{type: ack\|sos\|light\|visor_instruction\|commander_decision\|environment_change\|note, crew, text, payload}` |
| `GET /scenarios`, `GET /scenarios/{id}`, `POST /scenarios/{id}/play` `{crew, rate_hz}`, `POST /scenarios/stop`, `POST /reset` | demo control |
| `GET /crew`, `GET /crew/{id}`, `GET /crew/{id}/history` | live state / 14-sol OSDR history (+ route profile) |
| `GET /route`, `GET /route-profile`, `GET /thresholds`, `GET /standards`, `GET /pairing?crew=A`, `GET /info`, `GET /health` | data, QR pairing link, LAN URLs |

Crew ids accept `Crew_A`, `A`, `crew a`.

## Tests

```bash
python -m pytest -q                  # backend: models, API, WebSockets, engine, predict_all, core_math, rag_llm
cd frontend && npm test              # console: API adapter, WS mapping, Mode 2, phone simulator, voice, motion
npm run typecheck
```

CI runs both suites on every push. Frontend contract tests use **real Base Server responses** from
`frontend/test/fixtures/backend/`; after changing the backend API, start the server and re-capture them with
`npm run test:fixtures`. A known bug can be pinned with `it.fails(...)` — once it is fixed the test fails and should become a regular `it(...)`.

## Data sources

NASA OSDR [OSD-783](https://osdr.nasa.gov/bio/repo/data/studies/OSD-783) / [OSD-435](https://osdr.nasa.gov/bio/repo/data/studies/OSD-435),
NASA LRO LOLA Site04 (Shackleton rim), Apollo 14–16 EVA metabolic report, 2023 simulated lunar EVA study,
NASA-STD-3001 Vol. 1 & 2, NASA OCHMO-TB-004, PhysioNet (BIDMC, PTT PPG, sEMG, treadmill, ACTES), Figshare PLOS ONE NIRS/sEMG.
Normalized files and their mapping to the models: [`data/README.md`](data/README.md).
