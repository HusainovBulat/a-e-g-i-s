"""
In-memory Base Server state + orchestration (Master Plan §5: one object per crew member
plus ``event_log``; no database).

Responsibilities:
  * ingest 1 Hz sensor packets (phone or server-side scenario player) → run Model A/B →
    broadcast ``state`` to every console;
  * detect emergencies → run Model C triage → broadcast ``alarm_jump_to_emergency``;
  * 30-second wrist "OK" countdown after a fall, auto-escalating to SOS;
  * Mode 2 / Mode 3 request handling, Commander summary, event timeline, routine prompts.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional

from . import rag_llm

from . import config
from .data_store import DataStore
from .engine import (
    DEFAULT_PACKET, PACKET_NUMERIC_KEYS, SCENARIO_START_DISTANCE_M, CrewTelemetry, Engine,
    match_symptom_keywords,
)
from .hub import ConsoleHub, envelope
from .ml.models import ModelRegistry

log = logging.getLogger("aegis.service")


class ServiceError(ValueError):
    """Bad input from a client (mapped to HTTP 4xx / WS error message)."""


def normalize_crew(value: Any) -> str:
    raw = str(value or "Crew_A").strip()
    letter = raw.replace("-", "_").replace(" ", "_").split("_")[-1].upper()
    crew = f"Crew_{letter}"
    if crew not in config.CREW_IDS:
        raise ServiceError(f"Unknown crew '{value}'. Expected one of {list(config.CREW_IDS)}")
    return crew


def crew_label(crew_id: str) -> str:
    return crew_id.replace("_", " ")


@dataclass
class CrewRuntime:
    crew_id: str
    telemetry: CrewTelemetry
    snapshot: Dict[str, Any] = field(default_factory=dict)
    source: str = "idle"
    scenario_id: Optional[str] = None
    player_task: Optional[asyncio.Task] = None
    overrides: Dict[str, Any] = field(default_factory=dict)
    emergency_active: bool = False
    last_auto_triage: float = -1e9
    alarm: Optional[Dict[str, Any]] = None
    fall_task: Optional[asyncio.Task] = None
    fall_deadline: Optional[float] = None
    last_triage: Optional[Dict[str, Any]] = None
    last_evening: Optional[Dict[str, Any]] = None
    last_summary: Optional[Dict[str, Any]] = None
    base_vitals: Dict[str, float] = field(default_factory=lambda: {
        "hr": 72.0, "spo2": 98.4, "smo2": 78.5, "sys": 118.0, "dia": 76.0, "resp": 14.0
    })


class AegisService:
    def __init__(self, store: DataStore, models: ModelRegistry, hub: Optional[ConsoleHub] = None) -> None:
        self.store = store
        self.models = models
        self.engine = Engine(store, models)
        self.hub = hub or ConsoleHub()
        self.crews: Dict[str, CrewRuntime] = {
            cid: CrewRuntime(cid, CrewTelemetry(cid)) for cid in config.CREW_IDS
        }
        self.event_log: Deque[Dict[str, Any]] = deque(maxlen=config.EVENT_LOG_LIMIT)
        self._event_seq = 0
        self._t0 = time.monotonic()
        self._routine_task: Optional[asyncio.Task] = None
        self._ticker_task: Optional[asyncio.Task] = None
        self._routine_idx = 0
        for rt in self.crews.values():
            rt.snapshot = self.engine.compute_snapshot(rt.telemetry, self.now())

    # ------------------------------------------------------------------ lifecycle
    def now(self) -> float:
        return time.monotonic() - self._t0

    async def start(self) -> None:
        if config.ROUTINE_PROMPT_INTERVAL_S > 0:
            self._routine_task = asyncio.create_task(self._routine_loop())
        self._ticker_task = asyncio.create_task(self._ticker_loop())

    async def stop(self) -> None:
        tasks = [self._routine_task, self._ticker_task] + [t for rt in self.crews.values() for t in (rt.player_task, rt.fall_task)]
        for t in tasks:
            if t and not t.done():
                t.cancel()
        await asyncio.gather(*(t for t in tasks if t), return_exceptions=True)

    async def _ticker_loop(self) -> None:
        tick = 0
        while True:
            await asyncio.sleep(1.0)
            tick += 1
            now = self.now()
            # If any console is connected, keep 1 Hz telemetry alive with smooth, non-accumulating micro-fluctuations
            for cid, rt in self.crews.items():
                if rt.player_task is not None and not rt.player_task.done():
                    continue
                sin_wave = math.sin(tick * 0.15 + (ord(cid[-1]) % 4))
                cos_wave = math.cos(tick * 0.12)
                base_hr = float(rt.base_vitals.get("hr", 72.0))
                base_spo2 = float(rt.base_vitals.get("spo2", 98.4))
                base_smo2 = float(rt.base_vitals.get("smo2", 78.5))
                fluct_hr = round(base_hr + sin_wave * 0.8, 1)
                fluct_spo2 = round(min(100.0, max(85.0, base_spo2 + cos_wave * 0.15)), 1)
                fluct_smo2 = round(max(20.0, min(100.0, base_smo2 + sin_wave * 0.25)), 1)
                self.engine.ingest(rt.telemetry, {"hr": fluct_hr, "spo2": fluct_spo2, "smo2": fluct_smo2}, now)
                rt.snapshot = self.engine.compute_snapshot(rt.telemetry, now, rt.last_evening)
                if self.hub.count > 0:
                    await self._broadcast_state(cid)

    async def _routine_loop(self) -> None:
        while True:
            await asyncio.sleep(config.ROUTINE_PROMPT_INTERVAL_S)
            text = config.ROUTINE_PROMPTS[self._routine_idx % len(config.ROUTINE_PROMPTS)]
            self._routine_idx += 1
            await self.hub.broadcast(envelope("routine_prompt", {"text": text, "index": self._routine_idx}))

    # ------------------------------------------------------------------ views
    def crew_state(self, crew_id: str) -> Dict[str, Any]:
        rt = self.crews[crew_id]
        rec = self.store.crew_record(crew_id) or {}
        remaining = None
        if rt.fall_deadline is not None:
            remaining = max(0.0, round(rt.fall_deadline - self.now(), 1))
        return {
            **rt.snapshot,
            "crew": crew_id,
            "name": rec.get("name", crew_label(crew_id)),
            "role": rec.get("role"),
            "source": rt.source,
            "scenario": rt.scenario_id,
            "alarm": rt.alarm,
            "fall_countdown_s": remaining,
            "packets_received": rt.telemetry.packets_received,
            "has_triage": rt.last_triage is not None,
            "evening_readiness": rt.last_evening["readiness_score"] if rt.last_evening else None,
        }

    def all_states(self) -> Dict[str, Any]:
        return {cid: self.crew_state(cid) for cid in self.crews}

    def hello_payload(self) -> Dict[str, Any]:
        return {
            "crews": self.all_states(),
            "events": list(self.event_log)[-50:],
            "scenarios": list((self.store.scenarios.get("scenarios") or {}).keys()),
            "environments": list(self.store.thresholds.get("environments", {}).keys()),
            "models": self.models.info(),
            "consoles_connected": self.hub.count,
        }

    # ------------------------------------------------------------------ events
    async def add_event(self, kind: str, text: str, crew: Optional[str] = None,
                        data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._event_seq += 1
        entry = {
            "id": self._event_seq,
            "time": datetime.now().strftime("%H:%M"),
            "ts": datetime.now().isoformat(timespec="seconds"),
            "type": kind,
            "crew": crew,
            "text": f"{datetime.now().strftime('%H:%M')} {text}",
            "data": data or {},
        }
        self.event_log.append(entry)
        await self.hub.broadcast(envelope("event", entry, crew))
        return entry

    async def handle_event(self, body: Dict[str, Any]) -> Dict[str, Any]:
        kind = str(body.get("type", "")).strip().lower()
        crew = normalize_crew(body["crew"]) if body.get("crew") else None
        payload = body.get("payload") or {}
        text = body.get("text") or payload.get("text")

        if kind in ("ack", "ok", "wrist_ok"):
            if not crew:
                raise ServiceError("'ack' needs a crew")
            rt = self.crews[crew]
            self._cancel_fall_countdown(rt)
            rt.alarm = None
            rt.overrides.pop("fall", None)
            rt.telemetry.packet["fall"] = 0.0
            entry = await self.add_event("ack", f"{crew_label(crew)} wrist OK — alarm cancelled", crew)
            await self.hub.broadcast(envelope("ack", {"crew": crew}, crew))
            await self._broadcast_state(crew)
        elif kind == "sos":
            if not crew:
                raise ServiceError("'sos' needs a crew")
            rt = self.crews[crew]
            rt.alarm = {"level": "red", "reasons": ["manual_sos"], "since": self.now()}
            entry = await self.add_event("sos", f"{crew_label(crew)} pressed SOS", crew)
            await self._emergency_jump(crew, ["manual_sos"])
        elif kind == "light":
            entry = await self.add_event("light", f"{crew_label(crew or 'Crew_A')} switched on helmet light", crew)
        elif kind in ("visor_instruction", "send_instruction"):
            if not crew or not text:
                raise ServiceError("'visor_instruction' needs crew and text")
            entry = await self.add_event("visor_instruction", f"Sent to {crew_label(crew)}'s visor: {text}", crew,
                                         {"instruction": text})
            await self.hub.broadcast(envelope("visor_instruction", {"crew": crew, "text": text}, crew))
        elif kind in ("commander_decision", "approve_swap", "send_to_flight_surgeons"):
            decision = payload.get("decision") or ("approve_swap" if kind == "approve_swap" else
                                                   "send_to_flight_surgeons" if kind == "send_to_flight_surgeons"
                                                   else "approve_swap")
            replacement = payload.get("replacement")
            if decision == "approve_swap":
                msg = f"Commander approved schedule swap for {crew_label(crew or 'Crew_A')}"
                if replacement:
                    msg += f" → {crew_label(normalize_crew(replacement))}"
            else:
                msg = f"{crew_label(crew or 'Crew_A')} briefing sent to Flight Surgeons on Earth"
            entry = await self.add_event("commander_decision", msg, crew, {"decision": decision, "replacement": replacement})
            await self.hub.broadcast(envelope("commander_decision", {"crew": crew, **entry["data"]}, crew))
        elif kind in ("environment_change", "set_environment"):
            env = payload.get("env") or body.get("env")
            if not env:
                raise ServiceError("'environment_change' needs payload.env")
            targets = [crew] if crew else list(self.crews)
            for cid in targets:
                self.crews[cid].telemetry.packet["env"] = env
                self.crews[cid].overrides["env"] = env
                await self._recompute(cid)
            entry = await self.add_event("environment_change", f"Environment → {env}", crew, {"env": env})
        else:
            entry = await self.add_event(kind or "note", text or kind or "note", crew, payload)
        return entry

    # ------------------------------------------------------------------ sensors
    async def handle_sensor_message(self, msg: Dict[str, Any], source: str = "phone") -> Dict[str, Any]:
        kind = str(msg.get("type", "telemetry")).lower()
        crew = normalize_crew(msg.get("crew", "Crew_A"))
        if kind == "scenario":
            scenario = msg.get("scenario") or msg.get("id")
            return await self.play_scenario(str(scenario), crew, float(msg.get("rate_hz", 1.0)))
        if kind == "stop":
            await self.stop_scenario(crew)
            return {"ok": True, "crew": crew, "stopped": True}
        if kind == "fall":
            await self.ingest(crew, {"fall": 1}, source=f"{source}:gyroscope", sticky=True)
            return {"ok": True, "crew": crew, "fall": True}
        if kind in ("override", "telemetry", "sensors", "packet"):
            values = msg.get("values") if kind == "override" else msg
            values = {k: v for k, v in (values or {}).items() if k in PACKET_NUMERIC_KEYS or k in ("env", "distance_m")}
            await self.ingest(crew, values, source=source, sticky=kind == "override")
            return {"ok": True, "crew": crew}
        raise ServiceError(f"Unknown sensor message type '{kind}'")

    async def ingest(self, crew: str, values: Dict[str, Any], source: str, sticky: bool = False) -> None:
        rt = self.crews[crew]
        if rt.player_task and not rt.player_task.done() and not source.startswith("scenario"):
            sticky = True  # live phone slider on top of a playing scenario -> keep as override
        if sticky:
            rt.overrides.update({k: v for k, v in values.items() if k != "distance_m"})
        for k in ("hr", "spo2", "smo2", "sys", "dia", "resp"):
            if k in values and values[k] is not None:
                rt.base_vitals[k] = float(values[k])
        prev_fall = bool(rt.telemetry.packet.get("fall"))
        merged = {**values, **rt.overrides} if source.startswith("scenario") else values
        t = self.now()
        self.engine.ingest(rt.telemetry, merged, t)
        rt.snapshot = self.engine.compute_snapshot(rt.telemetry, t, rt.last_evening)
        if not source.startswith("scenario") or rt.source == "idle":
            rt.source = source
        await self._check_emergency(crew, prev_fall)
        await self._broadcast_state(crew)

    async def _recompute(self, crew: str) -> None:
        rt = self.crews[crew]
        rt.snapshot = self.engine.compute_snapshot(rt.telemetry, self.now(), rt.last_evening)
        await self._broadcast_state(crew)

    async def _broadcast_state(self, crew: str) -> None:
        await self.hub.broadcast(envelope("state", self.crew_state(crew), crew))

    # ------------------------------------------------------------------ emergencies
    async def _check_emergency(self, crew: str, prev_fall: bool) -> None:
        rt = self.crews[crew]
        packet = rt.telemetry.packet
        reasons = self.engine.emergency_reasons(packet)
        countdown_running = rt.fall_task is not None and not rt.fall_task.done()
        # A shaking phone reports the same fall many times: only a wrist OK / reset ends the
        # countdown, repeated fall edges must not restart the 30 s window.
        if bool(packet.get("fall")) and not prev_fall and not countdown_running:
            self._start_fall_countdown(crew)
            await self.add_event("fall", f"{crew_label(crew)} fall detected — {int(config.FALL_ACK_WINDOW_S)} s wrist OK countdown", crew)
        newly = bool(reasons) and not rt.emergency_active
        rt.emergency_active = bool(reasons)
        if newly and self.now() - rt.last_auto_triage >= config.AUTO_TRIAGE_COOLDOWN_S:
            rt.last_auto_triage = self.now()
            rt.alarm = {"level": "red", "reasons": reasons, "since": round(self.now(), 1)}
            await self._emergency_jump(crew, reasons)

    def _inferred_symptoms(self, rt: CrewRuntime) -> Dict[str, bool]:
        p = rt.telemetry.packet
        st_mv = p["st"] / 10.0 if abs(p["st"]) > 0.5 else p["st"]
        return {
            "chest_pain": st_mv >= 0.1 or rt.scenario_id == "chest_pain",
            "cold_sweat": rt.scenario_id == "chest_pain" or (p["sys"] < 90 and p["hr"] > 100),
            "dizzy": bool(p.get("dizzy")),
            "short_breath": p["resp"] > 24 or p["spo2"] < 92,
            "fall_event": bool(p.get("fall")),
        }

    async def _emergency_jump(self, crew: str, reasons: List[str]) -> None:
        rt = self.crews[crew]
        result = self.engine.triage(
            rt.telemetry.packet, self._inferred_symptoms(rt),
            readiness=rt.last_evening["readiness_score"] if rt.last_evening else None,
        )
        result["crew"] = crew
        result["trigger"] = "auto"
        rt.last_triage = result
        await self._log_triage(crew, result)
        await self.hub.broadcast(envelope("alarm_jump_to_emergency", {
            "crew": crew, "reasons": reasons, "triage": result, "state": self.crew_state(crew),
        }, crew))

    async def _log_triage(self, crew: str, result: Dict[str, Any]) -> None:
        await self.add_event("triage", f"{crew_label(crew)} triage: {result['primary_class']}", crew,
                             {"primary_class": result["primary_class"], "why": result["tree_path_why"]})
        for d in result["dont_give_list"]:
            await self.add_event("contraindication", f"{d['drug']} blocked ({d['reason'].replace(' < 90 mmHg', '')})", crew)
        if result["flight_surgeons_queued"]:
            await self.add_event("flight_surgeons", f"{crew_label(crew)} queued for Flight Surgeons on Earth", crew)

    def _start_fall_countdown(self, crew: str) -> None:
        rt = self.crews[crew]
        self._cancel_fall_countdown(rt)
        rt.fall_deadline = self.now() + config.FALL_ACK_WINDOW_S
        rt.fall_task = asyncio.create_task(self._fall_countdown(crew))

    def _cancel_fall_countdown(self, rt: CrewRuntime) -> None:
        if rt.fall_task and not rt.fall_task.done():
            rt.fall_task.cancel()
        rt.fall_task = None
        rt.fall_deadline = None

    async def _fall_countdown(self, crew: str) -> None:
        rt = self.crews[crew]
        try:
            await self.hub.broadcast(envelope("fall_countdown", {"crew": crew, "seconds": config.FALL_ACK_WINDOW_S}, crew))
            await asyncio.sleep(config.FALL_ACK_WINDOW_S)
        except asyncio.CancelledError:
            return
        rt.fall_task = None
        rt.fall_deadline = None
        rt.alarm = {"level": "red", "reasons": ["fall_no_ack"], "since": round(self.now(), 1)}
        await self.add_event("sos_auto", f"{crew_label(crew)} no wrist OK in {int(config.FALL_ACK_WINDOW_S)} s — SOS beacon + suit resuscitation", crew)
        await self.hub.broadcast(envelope("sos_auto_escalated", {
            "crew": crew,
            "suit_systems": ["helmet_co2_flush", "peltier_cold_shock_+10C", "fes_calf_compression", "uhf_uwb_beacon"],
        }, crew))
        await self._broadcast_state(crew)

    # ------------------------------------------------------------------ scenario player
    async def play_scenario(self, scenario_id: str, crew: str, rate_hz: float = 1.0) -> Dict[str, Any]:
        scenario = self.store.scenario(scenario_id)
        if not scenario:
            raise ServiceError(f"Unknown scenario '{scenario_id}'")
        if scenario_id == "reset_all":
            await self.reset_all()
            return {"ok": True, "scenario": scenario_id, "crew": "all"}
        await self.stop_scenario(crew)
        rt = self.crews[crew]
        self._cancel_fall_countdown(rt)
        rt.telemetry.reset(SCENARIO_START_DISTANCE_M.get(scenario_id, 0.0))
        rt.overrides.clear()
        rt.alarm = None
        rt.emergency_active = False
        rt.last_auto_triage = -1e9
        rt.scenario_id = scenario_id
        rt.source = f"scenario:{scenario_id}"
        rt.player_task = asyncio.create_task(self._player(crew, scenario, max(0.1, min(rate_hz, 50.0))))
        await self.add_event("scenario", f"{crew_label(crew)} scenario: {scenario.get('name', scenario_id)}", crew,
                             {"scenario": scenario_id})
        return {"ok": True, "scenario": scenario_id, "crew": crew, "frames": len(scenario.get("timeline_60s", []))}

    async def _player(self, crew: str, scenario: Dict[str, Any], rate_hz: float) -> None:
        frames = scenario.get("timeline_60s") or [scenario.get("initial_state", {})]
        i = 0
        try:
            while True:
                frame = {k: v for k, v in frames[i % len(frames)].items() if k not in ("crew", "t")}
                await self.ingest(crew, frame, source=f"scenario:{scenario['id']}")
                i += 1
                await asyncio.sleep(1.0 / rate_hz)
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("Scenario player for %s crashed", crew)

    async def stop_scenario(self, crew: str) -> None:
        rt = self.crews[crew]
        if rt.player_task and not rt.player_task.done():
            rt.player_task.cancel()
            await asyncio.gather(rt.player_task, return_exceptions=True)
        rt.player_task = None
        rt.scenario_id = None

    async def reset_all(self) -> None:
        baseline = (self.store.scenario("reset_all") or {}).get("initial_state") or DEFAULT_PACKET
        for cid, rt in self.crews.items():
            await self.stop_scenario(cid)
            self._cancel_fall_countdown(rt)
            rt.telemetry.reset()
            rt.overrides.clear()
            rt.alarm = None
            rt.emergency_active = False
            rt.last_auto_triage = -1e9
            rt.last_triage = None
            rt.source = "idle"
            rt.base_vitals = {
                "hr": float(DEFAULT_PACKET.get("hr", 72)),
                "spo2": float(DEFAULT_PACKET.get("spo2", 98.4)),
                "smo2": float(DEFAULT_PACKET.get("smo2", 78.5)),
                "sys": float(DEFAULT_PACKET.get("sys", 118)),
                "dia": float(DEFAULT_PACKET.get("dia", 76)),
                "resp": float(DEFAULT_PACKET.get("resp", 14)),
            }
            self.engine.ingest(rt.telemetry, {**baseline, "env": DEFAULT_PACKET["env"]}, self.now())
            rt.snapshot = self.engine.compute_snapshot(rt.telemetry, self.now(), rt.last_evening)
        await self.add_event("reset", "Reset all — nominal baseline restored for all crew")
        await self.hub.broadcast(envelope("reset", {"crews": self.all_states()}))

    # ------------------------------------------------------------------ Mode 2
    async def triage(self, req: Dict[str, Any]) -> Dict[str, Any]:
        crew = normalize_crew(req.get("crew", "Crew_A"))
        rt = self.crews[crew]
        vitals = {**rt.telemetry.packet, **{k: v for k, v in (req.get("vitals") or {}).items() if v is not None}}
        flags = {k: bool(v) for k, v in (req.get("symptom_flags") or {}).items()}
        matched = None
        if req.get("transcript"):
            matched = match_symptom_keywords(req["transcript"])
            for k, v in matched["flags"].items():
                flags[k] = flags.get(k, False) or v
        readiness = req.get("readiness")
        if readiness is None and rt.last_evening:
            readiness = rt.last_evening["readiness_score"]
        result = self.engine.triage(vitals, flags, bool(req.get("ultrasound_attached")), readiness)
        result["crew"] = crew
        result["trigger"] = "console"
        if matched:
            result["matched_keywords"] = matched["matched_keywords"]
        rt.last_triage = result
        await self._log_triage(crew, result)
        await self.hub.broadcast(envelope("triage_result", result, crew))
        return result

    # ------------------------------------------------------------------ Mode 3
    async def evening(self, req: Dict[str, Any]) -> Dict[str, Any]:
        crew = normalize_crew(req.get("crew", "Crew_A"))
        rt = self.crews[crew]
        sliders = {k: float(req[k]) for k in ("sleep", "energy", "mood", "pain_free", "nutrition")}
        live = rt.snapshot if rt.telemetry.packets_received and rt.source != "idle" else None
        result = self.engine.evening(
            crew, sliders, req.get("blood_sugar_mgdl"), req.get("bp_sys"), req.get("bp_dia"), req.get("temp"),
            list(req.get("completed_quests") or []), live,
        )
        rt.last_evening = result
        rt.snapshot = self.engine.compute_snapshot(rt.telemetry, self.now(), result)
        band_icon = {"green": "🟢", "amber": "🟡", "red": "🔴"}[result["band"]]
        msg = f"{crew_label(crew)} evening check-in: readiness {result['readiness_score']:.0f} {band_icon}"
        if result["mismatch_detected"]:
            msg += " · Mismatch detected"
        await self.add_event("evening", msg, crew)
        await self.hub.broadcast(envelope("evening_result", result, crew))
        await self._broadcast_state(crew)
        return result

    def default_evening_request(self, crew: str) -> Dict[str, Any]:
        latest = self.store.latest_sol(crew)
        return {
            "crew": crew,
            "sleep": latest.get("subjective_sleep_slider", 8), "energy": latest.get("subjective_energy_slider", 8),
            "mood": latest.get("subjective_mood_slider", 8), "pain_free": latest.get("subjective_pain_free_slider", 8),
            "nutrition": latest.get("subjective_nutrition_slider", 8),
            "blood_sugar_mgdl": latest.get("blood_sugar_mgdl"), "temp": latest.get("body_temp_c"),
            "completed_quests": [],
        }

    async def summary(self, req: Dict[str, Any]) -> Dict[str, Any]:
        evening = req.get("evening")
        if evening:
            raw_cid = evening.get("crew_id") or evening.get("crew") or req.get("crew") or "Crew_A"
            crew = normalize_crew(raw_cid)
        else:
            crew = normalize_crew(req.get("crew") or "Crew_A")
            evening = self.crews[crew].last_evening or await self.evening(self.default_evening_request(crew))

        payload = dict(evening)
        payload.setdefault("crew_id", crew)
        started = time.perf_counter()
        api_key = "" if req.get("offline") else None
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(rag_llm.generate_commander_summary, payload, api_key),
                timeout=config.SUMMARY_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            result = rag_llm.generate_deterministic_fallback(payload, reason=f"TIMEOUT>{config.SUMMARY_TIMEOUT_S}s")
        except Exception as exc:  # never fail the Commander panel
            result = rag_llm.generate_deterministic_fallback(payload, reason=f"ERROR: {type(exc).__name__}")
        result["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 1)
        result["crew"] = crew
        if result.get("schedule_action") == "SWAP_SCHEDULE":
            result["recommended_crew"] = self.engine.best_replacement(crew)
        result["readiness_score"] = payload.get("readiness_score")
        self.crews[crew].last_summary = result
        await self.add_event("summary", f"Commander briefing ready for {crew_label(crew)} ({result['source']})", crew)
        await self.hub.broadcast(envelope("commander_summary", result, crew))
        return result
