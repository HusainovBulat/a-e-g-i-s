"""
Train Model A (+fallback), Model B and Model C deterministically from data/table_*.csv and
export them to models/*.pkl (the exact files the Base Server loads at startup).

    python -m scripts.train_models

Also runs the 3 mandatory NASA benchmark checks for Model B (0° / 10° / 18°).
If the ML team drops its own .pkl files into models/, the server uses those instead.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import joblib  # noqa: E402

from app.config import MODELS_DIR  # noqa: E402
from app.ml.models import (  # noqa: E402
    MODEL_A_FALLBACK_FEATURES, MODEL_A_FEATURES, ModelRegistry, train_model_a, train_model_b, train_model_c,
)


def main() -> int:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    models = [
        train_model_a(MODEL_A_FEATURES, "model_a_full"),
        train_model_a(MODEL_A_FALLBACK_FEATURES, "model_a_fallback"),
        train_model_b(),
        train_model_c(),
    ]
    for m in models:
        path = MODELS_DIR / f"{m.name}.pkl"
        joblib.dump({"model": m.estimator, "features": m.features}, path)
        print(f"saved {path.relative_to(ROOT)}  features={m.features}  metrics={m.metrics}")

    reg = ModelRegistry()
    ok = True
    for slope, lo, hi in ((0.0, 185, 310), (10.0, 250, 480), (18.0, 480, 550)):
        w, _ = reg.predict_metabolic_watts(2.5, slope, 10.0)  # fresh crew, as in Apollo / 2023 benchmarks
        passed = lo <= w <= hi
        ok &= passed
        print(f"Model B @ {slope:>4}°: {w:6.1f} W  expected {lo}-{hi} W  {'PASS' if passed else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
