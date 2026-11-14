"""Read-only runtime datasets (loaded once at startup from ``data/``)."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from .config import DATA_DIR


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_csv_rows(name: str) -> List[Dict[str, str]]:
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Training table not found: {path}")
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


@dataclass
class DataStore:
    thresholds: Dict[str, Any] = field(default_factory=dict)
    scenarios: Dict[str, Any] = field(default_factory=dict)
    crew_history: Dict[str, Any] = field(default_factory=dict)
    route_profile: List[Dict[str, Any]] = field(default_factory=list)
    excerpts: Dict[str, Any] = field(default_factory=dict)

    # ---- convenience accessors -------------------------------------------------
    def scenario(self, scenario_id: str) -> Dict[str, Any] | None:
        return self.scenarios.get("scenarios", {}).get(scenario_id)

    def crew_record(self, crew_id: str) -> Dict[str, Any] | None:
        return self.crew_history.get("crew", {}).get(crew_id)

    def latest_sol(self, crew_id: str) -> Dict[str, Any]:
        rec = self.crew_record(crew_id) or {}
        hist = rec.get("history") or []
        return dict(hist[-1]) if hist else {}

    @property
    def plss(self) -> Dict[str, float]:
        return self.thresholds.get(
            "eva_spacesuit_plss",
            {
                "tank_capacity_liters": 750.0,
                "emergency_reserve_liters": 150.0,
                "walk_back_warning_minutes": 15.0,
                "walk_back_critical_minutes": 5.0,
                "max_safe_slope_deg": 22.0,
            },
        )


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore(
        thresholds=_load_json(DATA_DIR / "thresholds.json", {}),
        scenarios=_load_json(DATA_DIR / "scenarios.json", {"scenarios": {}}),
        crew_history=_load_json(DATA_DIR / "crew_history.json", {"crew": {}}),
        route_profile=_load_json(DATA_DIR / "route_profile.json", []),
        excerpts=_load_json(DATA_DIR / "nasa_std_3001_excerpts.json", {}),
    )
