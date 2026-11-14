"""Paths and runtime settings (overridable through environment variables / .env)."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (real environment variables win)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_dotenv(PROJECT_ROOT / ".env")
DATA_DIR = Path(os.getenv("AEGIS_DATA_DIR", PROJECT_ROOT / "data"))
MODELS_DIR = Path(os.getenv("AEGIS_MODELS_DIR", PROJECT_ROOT / "models"))

CREW_IDS = ("Crew_A", "Crew_B", "Crew_C", "Crew_D")

# Fixed seed so rehearsals and the live demo are 100% deterministic.
RANDOM_SEED = 42

# Seconds between "Mission Routine Prompts" pushed to consoles (0 disables).
ROUTINE_PROMPT_INTERVAL_S = float(os.getenv("AEGIS_ROUTINE_PROMPT_INTERVAL_S", "120"))
# Wrist "OK" window before a detected fall is auto-escalated to SOS.
FALL_ACK_WINDOW_S = float(os.getenv("AEGIS_FALL_ACK_WINDOW_S", "30"))
# Minimum seconds between two automatic emergency triages for the same crew member.
AUTO_TRIAGE_COOLDOWN_S = float(os.getenv("AEGIS_AUTO_TRIAGE_COOLDOWN_S", "20"))
# Hard limit for the RAG-LLM call before the deterministic template is returned.
SUMMARY_TIMEOUT_S = float(os.getenv("AEGIS_SUMMARY_TIMEOUT_S", "4.0"))
# Rolling window used for Model A's "rate of fatigue rise" (spec: last 5 min).
FATIGUE_RATE_WINDOW_S = 300.0
# How many event_log entries are kept in memory.
EVENT_LOG_LIMIT = 500

CORS_ORIGINS = [o.strip() for o in os.getenv("AEGIS_CORS_ORIGINS", "*").split(",") if o.strip()]

ROUTINE_PROMPTS = [
    "🩸 Time to measure blood sugar (mg/dL) with the capillary glucometer.",
    "💧 Hydration check: drink 250 mL of isotonic electrolyte solution.",
    "🫀 Measure blood pressure (cuff, seated, 1 min rest).",
    "😴 Log sleep hours and mood (0..10) before the evening check-in.",
]
