"""REST + WebSocket routes (Master Plan §5)."""

from __future__ import annotations

import json
import logging
import os
import socket
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from .engine import match_symptom_keywords
from .hub import envelope
from .schemas import EveningRequest, EventRequest, ScenarioPlayRequest, SummaryRequest, TriageRequest
from .service import AegisService, ServiceError, normalize_crew

log = logging.getLogger("aegis.api")
router = APIRouter()


def svc(request: Request) -> AegisService:
    return request.app.state.service


def _crew(value: str) -> str:
    try:
        return normalize_crew(value)
    except ServiceError as exc:
        raise HTTPException(404, str(exc)) from exc


# ---------------------------------------------------------------------- meta
@router.get("/health", tags=["meta"])
async def health(request: Request) -> Dict[str, Any]:
    s = svc(request)
    return {"status": "ok", "consoles_connected": s.hub.count, "models": {k: v["source"] for k, v in s.models.info().items()}}


def _lan_ips() -> list[str]:
    # Inside Docker the container IP is useless for the phone: start.bat/start.sh pass the host IPs.
    public = [h.strip() for h in os.getenv("AEGIS_PUBLIC_HOSTS", "").split(",") if h.strip()]
    if public:
        return public
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # no packet is sent; picks the outbound interface
            ips.add(s.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


@router.get("/info", tags=["meta"])
async def info(request: Request) -> Dict[str, Any]:
    """LAN addresses for the console's QR pairing code."""
    s = svc(request)
    scheme = request.url.scheme
    ws_scheme = "wss" if scheme == "https" else "ws"
    port = request.url.port or int(os.getenv("AEGIS_PORT", "8000"))
    hosts = _lan_ips()
    return {
        "lan_ips": hosts,
        "base_urls": [f"{scheme}://{h}:{port}" for h in hosts],
        "ws_sensors_urls": [f"{ws_scheme}://{h}:{port}/ws/sensors" for h in hosts],
        "ws_console_urls": [f"{ws_scheme}://{h}:{port}/ws/console" for h in hosts],
        "models": s.models.info(),
        "crew": list(s.crews),
    }


# ---------------------------------------------------------------------- data
@router.get("/scenarios", tags=["data"])
async def scenarios(request: Request, include_timeline: bool = Query(True)) -> Dict[str, Any]:
    data = svc(request).store.scenarios
    if include_timeline:
        return data
    return {
        "metadata": data.get("metadata", {}),
        "scenarios": {k: {kk: vv for kk, vv in v.items() if kk != "timeline_60s"} for k, v in data.get("scenarios", {}).items()},
    }


@router.get("/scenarios/{scenario_id}", tags=["data"])
async def scenario(request: Request, scenario_id: str) -> Dict[str, Any]:
    sc = svc(request).store.scenario(scenario_id)
    if not sc:
        raise HTTPException(404, f"Unknown scenario '{scenario_id}'")
    return sc


@router.post("/scenarios/{scenario_id}/play", tags=["sensors"])
async def play(request: Request, scenario_id: str, body: ScenarioPlayRequest | None = None) -> Dict[str, Any]:
    """Server-side 1 Hz playback of a scenario (console simulator overlay / no phone available)."""
    body = body or ScenarioPlayRequest()
    return await svc(request).play_scenario(scenario_id, normalize_crew(body.crew), body.rate_hz)


@router.post("/scenarios/stop", tags=["sensors"])
async def stop(request: Request, body: ScenarioPlayRequest | None = None) -> Dict[str, Any]:
    crew = normalize_crew((body or ScenarioPlayRequest()).crew)
    await svc(request).stop_scenario(crew)
    return {"ok": True, "crew": crew}


@router.post("/reset", tags=["sensors"])
async def reset(request: Request) -> Dict[str, Any]:
    await svc(request).reset_all()
    return {"ok": True}


@router.get("/crew", tags=["crew"])
async def crew_list(request: Request) -> Dict[str, Any]:
    return svc(request).all_states()


@router.get("/crew/{crew_id}", tags=["crew"])
async def crew_state(request: Request, crew_id: str) -> Dict[str, Any]:
    s = svc(request)
    cid = _crew(crew_id)
    rt = s.crews[cid]
    return {**s.crew_state(cid), "last_triage": rt.last_triage, "last_evening": rt.last_evening,
            "last_summary": rt.last_summary}


@router.get("/crew/{crew_id}/history", tags=["crew"])
async def crew_history(request: Request, crew_id: str) -> Dict[str, Any]:
    s = svc(request)
    cid = _crew(crew_id)
    rec = s.store.crew_record(cid)
    if not rec:
        raise HTTPException(404, f"No history for {cid}")
    return {
        **rec,
        "source": s.store.crew_history.get("metadata", {}).get("source", "NASA OSDR OSD-783 / OSD-435"),
        "route_profile": s.store.route_profile,
    }


@router.get("/route", tags=["data"])
async def route(request: Request) -> Dict[str, Any]:
    pts = svc(request).store.route_profile
    return {"source": "NASA LRO LOLA Site04 (Shackleton Rim) 5 m/px", "total_m": pts[-1]["distance_m"] if pts else 0,
            "points": pts}


@router.get("/route-profile", tags=["data"])
async def route_profile(request: Request) -> Any:
    return svc(request).store.route_profile


@router.get("/pairing", tags=["meta"])
async def pairing(request: Request, crew: str = Query("A")) -> Dict[str, Any]:
    cid = normalize_crew(crew)
    letter = cid.replace("Crew_", "")
    hosts = _lan_ips()
    scheme = request.url.scheme
    port = 3000
    host = hosts[0] if hosts else "localhost"
    url = f"{scheme}://{host}:{port}/phone?crew={letter}"
    return {
        "crew": letter,
        "url": url,
        "lan_ips": hosts,
    }


@router.get("/thresholds", tags=["data"])
async def thresholds(request: Request) -> Dict[str, Any]:
    return svc(request).store.thresholds


@router.get("/standards", tags=["data"])
async def standards(request: Request) -> Dict[str, Any]:
    return svc(request).store.excerpts


# ---------------------------------------------------------------------- modes
@router.post("/sensors", tags=["sensors"])
async def sensors_http(request: Request, body: Dict[str, Any]) -> Dict[str, Any]:
    """HTTP fallback for WS /ws/sensors (same message format)."""
    return await svc(request).handle_sensor_message(body, source="phone:http")


@router.post("/triage", tags=["mode2"])
async def triage(request: Request, body: TriageRequest) -> Dict[str, Any]:
    return await svc(request).triage(body.model_dump())


@router.post("/triage/keywords", tags=["mode2"])
async def triage_keywords(body: Dict[str, str]) -> Dict[str, Any]:
    """Offline keyword matcher for the 'Hold to speak' transcript."""
    return match_symptom_keywords(body.get("transcript", ""))


@router.post("/evening", tags=["mode3"])
async def evening(request: Request, body: EveningRequest) -> Dict[str, Any]:
    return await svc(request).evening(body.model_dump())


@router.post("/summary", tags=["mode3"])
async def summary(request: Request, body: SummaryRequest) -> Dict[str, Any]:
    return await svc(request).summary(body.model_dump())


@router.post("/events", tags=["events"])
async def post_event(request: Request, body: EventRequest) -> Dict[str, Any]:
    return await svc(request).handle_event(body.model_dump())


@router.get("/events", tags=["events"])
async def get_events(request: Request, limit: int = Query(100, ge=1, le=500), crew: str | None = None) -> Dict[str, Any]:
    items = list(svc(request).event_log)
    if crew:
        cid = _crew(crew)
        items = [e for e in items if e["crew"] in (cid, None)]
    return {"events": items[-limit:]}


# ---------------------------------------------------------------------- websockets
@router.websocket("/ws/sensors")
async def ws_sensors(ws: WebSocket) -> None:
    """Phone sensor simulator → server (1 Hz). Every message is answered with an ``ack``."""
    s: AegisService = ws.app.state.service
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if not isinstance(msg, dict):
                    raise ServiceError("message must be a JSON object")
                result = await s.handle_sensor_message(msg, source="phone")
                await ws.send_json({"type": "ack", "data": result})
            except (ValueError, KeyError) as exc:  # includes JSONDecodeError / ServiceError
                await ws.send_json({"type": "error", "error": str(exc)})
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/console")
async def ws_console(ws: WebSocket) -> None:
    """Server → consoles / visor popup. Consoles may also send ``{"type":"event", ...}``."""
    s: AegisService = ws.app.state.service
    await s.hub.connect(ws)
    try:
        await s.hub.send(ws, envelope("hello", s.hello_payload()))
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                kind = msg.get("type")
                if kind == "ping":
                    await s.hub.send(ws, envelope("pong", {}))
                elif kind == "get_state":
                    await s.hub.send(ws, envelope("hello", s.hello_payload()))
                elif kind == "event":
                    await s.handle_event(msg.get("data") or {k: v for k, v in msg.items() if k != "type"})
                elif kind in ("scenario", "override", "fall", "stop", "telemetry"):
                    await s.handle_sensor_message(msg, source="console-sim")
                else:
                    raise ServiceError(f"Unknown console message type '{kind}'")
            except (ValueError, KeyError, AttributeError) as exc:
                await s.hub.send(ws, envelope("error", {"error": str(exc)}))
    except WebSocketDisconnect:
        pass
    finally:
        await s.hub.disconnect(ws)
