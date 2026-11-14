# A.E.G.I.S. Base Server (FastAPI + WebSockets)

[![tests](https://github.com/HusainovBulat/a-e-g-i-s/actions/workflows/tests.yml/badge.svg)](https://github.com/HusainovBulat/a-e-g-i-s/actions/workflows/tests.yml)

## ▶ One-click start

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Python 3.11+ as a fallback).
2. **Windows:** double-click `start.bat` · **macOS / Linux:** `./start.sh`
3. Swagger opens at http://localhost:8000/docs; the script prints the LAN URLs for the phone and console. Stop with `stop.bat` / `./stop.sh`.

Optional: put `GROQ_API_KEY=...` into `.env` (created from `.env.example` on first start) to enable the RAG-LLM Commander briefing.

Backend for the NASA Space Apps 2026 project (Master Plan §5). Everything is in-memory (Crew A–D + `event_log`), runs offline on the laptop hotspot; the frontend never recomputes numbers.

```
app/
  main.py         FastAPI app, lifespan (loads data + models)
  api.py          REST + WS routes
  service.py      in-memory state, auto-triage, fall countdown, scenario player, events
  engine.py       all calculations (Model A/B outputs, walk-back, visor line, triage rules, evening)
  ml/models.py    Model A/A-fallback/B/C: loads models/*.pkl, else trains from data/*.csv (seed 42)
  hub.py          console broadcast hub
core_math.py      organ scores, masking detector, readiness, forecast, Mode 2 hard rules (Kostya)
rag_llm.py        Commander RAG-LLM (Groq, temp 0) + deterministic template (Kostya)
data/             normalized datasets (unzipped data.zip)
scripts/train_models.py   export models/*.pkl + Model B NASA benchmarks
```

## Run

```bash
# Docker (no local Python needed)
docker build -t aegis-backend .
docker run --rm -p 8000:8000 --env-file .env aegis-backend

# or locally (Python 3.11+)
pip install -r requirements-dev.txt
python run.py                 # http://0.0.0.0:8000, Swagger at /docs
python run.py --https         # https/wss with certs/cert.pem + certs/key.pem (mkcert) — required for iOS motion
python -m pytest -q
```

`GROQ_API_KEY` in `.env` enables the LLM for `/summary`; without it (or if > 4 s) the template answers instantly.
Drop `model_a_full.pkl`, `model_a_fallback.pkl`, `model_b_metabolic.pkl`, `model_c_triage.pkl` into `models/` and they replace the in-process models (bare estimator or `{"model": est, "features": [...]}`; features are matched by name).

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
| `state` | every processed packet: vitals, `organ_scores` (6 zones, 0..100 + band), `model_a` (fatigue_score, legs_fail_in_min, …), `model_b` (metabolic_rate_watts, o2_burn_rate_l_min, o2_left_pct), `walk_back` (minutes, display `mm:ss`, level), `route_position`, `traffic_light`, `alerts`, `visor` (`line`, `instruction`, `dim_non_essential`), `alarm`, `fall_countdown_s` |
| `alarm_jump_to_emergency` | fall / ST ≥ 0.1 mV / BP < 90 / SpO2 < 92 → contains full `triage` result → switch to Mode 2 |
| `fall_countdown`, `ack`, `sos_auto_escalated` | wrist countdown lifecycle |
| `triage_result`, `evening_result`, `commander_summary` | results of the REST calls (all screens stay in sync) |
| `visor_instruction`, `commander_decision`, `routine_prompt`, `event`, `reset` | timeline / prompts |

Consoles can send `{"type":"ping"}`, `{"type":"get_state"}`, `{"type":"event", "data":{…same as POST /events…}}` and the sensor messages above (in-console simulator).

## REST

| Endpoint | Notes |
|---|---|
| `POST /triage` | `{crew, vitals{hr,sys,dia,spo2,resp,st,temp}, symptom_flags{chest_pain,dizzy,short_breath,cold_sweat,fall_event}, transcript?, ultrasound_attached?}` → `primary_class, ranked_other_classes, tree_path_why, dont_give_list, protocol_steps, flight_surgeons_queued, spoken_text`. Missing vitals come from live telemetry. |
| `POST /triage/keywords` | `{transcript}` → symptom flags (offline keyword matcher) |
| `POST /evening` | `{crew, sleep, energy, mood, pain_free, nutrition (0..10), blood_sugar_mgdl, bp:"118/76", temp, completed_quests:["hydration","compression","breathing"]}` → `readiness_score, band, mismatch_detected, mismatch_text, quests, readiness_if_all_quests, forecast_minutes, forecast_curve_no_rest, forecast_curve_with_quests, organ_scores_6, flight_surgeons_alert` |
| `POST /summary` | evening result JSON, or `{crew}` (uses last check-in), `offline:true` forces template → `commander_summary` (Markdown), `schedule_action`, `badge_text`, `recommended_crew`, `source`, `latency_ms` |
| `POST /events` / `GET /events` | `{type: ack|sos|light|visor_instruction|commander_decision|environment_change|note, crew, text, payload}` |
| `GET /scenarios`, `GET /scenarios/{id}`, `POST /scenarios/{id}/play` `{crew, rate_hz}`, `POST /scenarios/stop`, `POST /reset` | demo control |
| `GET /crew`, `GET /crew/{id}`, `GET /crew/{id}/history` | live state / 14-sol OSDR history (+ route profile) |
| `GET /route`, `GET /thresholds`, `GET /standards`, `GET /info` (LAN URLs for QR), `GET /health` | data |

Crew ids accept `Crew_A`, `A`, `crew a`.

## Tests

```bash
python -m pytest -q tests            # backend (models, API, WebSockets, engine)
cd frontend && npm test              # console: API adapter, WS mapping, Mode 2, phone simulator, voice, motion
npm run typecheck
```

Frontend contract tests run against **real Base Server responses** in `frontend/test/fixtures/backend/`.
After changing the backend API, start the server and re-capture them with `npm run test:fixtures`.
Tests marked `it.fails` document known frontend bugs: when a bug is fixed, that test starts failing — switch it to `it`.
