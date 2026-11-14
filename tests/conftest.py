import json
import os
import sys
from pathlib import Path

os.environ["AEGIS_ROUTINE_PROMPT_INTERVAL_S"] = "0"
os.environ["AEGIS_FALL_ACK_WINDOW_S"] = "0.5"
os.environ["GROQ_API_KEY"] = ""  # tests never call the network

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def chest_pain_frame():
    data = json.loads((ROOT / "data" / "scenarios.json").read_text(encoding="utf-8"))
    return data["scenarios"]["chest_pain"]["timeline_60s"][5]


def wait_for(ws, msg_type, limit=300):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg.get("type") == msg_type:
            return msg
    raise AssertionError(f"no '{msg_type}' message received")
