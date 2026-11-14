"""WebSocket fan-out hub for ``WS /ws/console`` (consoles, visor popup, wrist mirror)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Set

from fastapi import WebSocket

log = logging.getLogger("aegis.hub")


def envelope(msg_type: str, data: Any, crew: str | None = None) -> Dict[str, Any]:
    msg: Dict[str, Any] = {"type": msg_type, "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds")}
    if crew:
        msg["crew"] = crew
    msg["data"] = data
    return msg


class ConsoleHub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def count(self) -> int:
        return len(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def send(self, ws: WebSocket, message: Dict[str, Any]) -> None:
        await ws.send_text(json.dumps(message, ensure_ascii=False, allow_nan=False, default=str))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        if not self._clients:
            return
        text = json.dumps(message, ensure_ascii=False, allow_nan=False, default=str)
        async with self._lock:
            clients = list(self._clients)
        results = await asyncio.gather(*(c.send_text(text) for c in clients), return_exceptions=True)
        dead = [c for c, r in zip(clients, results) if isinstance(r, Exception)]
        if dead:
            async with self._lock:
                for c in dead:
                    self._clients.discard(c)
            log.info("Dropped %d dead console socket(s)", len(dead))
