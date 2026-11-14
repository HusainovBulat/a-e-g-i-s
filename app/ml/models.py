"""
Model A / Model B / Model C registry.

Load order for every model (first that works wins):
  1. ``models/<name>.pkl`` exported by the ML team (joblib / pickle).  The pickle may be a
     bare scikit-learn estimator or a dict ``{"model": est, "features": [...]}``.
  2. Deterministic in-process training on the normalized tables in ``data/``
     (``random_state=42`` so every run gives identical numbers).
  3. Closed-form formula fallback (keeps the demo alive even without scikit-learn).

Feature vectors are always built by *name*, so a pickle trained with a different column
order still receives the right values (``feature_names_in_`` is honoured when present).
"""

from __future__ import annotations

import logging
import math
import pickle
import warnings
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..config import MODELS_DIR, RANDOM_SEED
from ..data_store import load_csv_rows

log = logging.getLogger("aegis.models")

TRIAGE_CLASSES = [
    "Nominal",
    "Acute Coronary Ischemia",
    "Orthostatic Syncope",
    "Hypercapnia CO2",
    "Decompression Barotrauma",
]

MODEL_A_FEATURES = ["calf_smo2_pct", "nirs_desat_slope", "semg_mdf_shift_pct", "imu_gait_asymmetry"]
MODEL_A_FALLBACK_FEATURES = ["semg_mdf_shift_pct", "imu_gait_asymmetry", "hr_bpm"]
MODEL_B_FEATURES = ["speed_kmh", "slope_deg", "muscle_fatigue_score"]
MODEL_C_FEATURES = [
    "hr", "bp_sys", "bp_dia", "spo2", "resp_rate", "st_elevation_mv", "temp",
    "chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event",
]

# Aliases so a pickle trained with slightly different column names still works.
FEATURE_ALIASES: Dict[str, Sequence[str]] = {
    "calf_smo2_pct": ("smo2", "calf_smo2"),
    "semg_mdf_shift_pct": ("emg_mdf", "semg_mdf_shift"),
    "imu_gait_asymmetry": ("gait", "gait_wobble", "imu_gait_wobble"),
    "gait_wobble": ("gait", "imu_gait_asymmetry"),
    "hr_bpm": ("hr",),
    "hr": ("hr_bpm",),
    "slope_deg": ("slope",),
    "speed_kmh": ("speed",),
    "muscle_fatigue_score": ("fatigue_score", "fatigue"),
    "bp_sys": ("sys", "systolic_bp"),
    "bp_dia": ("dia", "diastolic_bp"),
    "resp_rate": ("resp", "respiration_rate"),
    "respiration_rate": ("resp", "resp_rate"),
    "st_elevation_mv": ("st",),
    "temp": ("body_temp_c",),
    "fall_event": ("fall",),
}

FEATURE_LABELS = {
    "hr": "HR", "bp_sys": "Systolic BP", "bp_dia": "Diastolic BP", "spo2": "SpO2",
    "resp_rate": "Resp rate", "st_elevation_mv": "ST elevation (mV)", "temp": "Temp",
    "chest_pain": "Chest pain", "dizzy": "Dizzy", "short_breath": "Short of breath",
    "cold_sweat": "Cold sweat", "fall_event": "Fall",
}
BINARY_FEATURES = {"chest_pain", "dizzy", "short_breath", "cold_sweat", "fall_event"}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(v)))


def _lookup(values: Dict[str, Any], name: str, default: float = 0.0) -> float:
    if name in values and values[name] is not None:
        return float(values[name])
    for alias in FEATURE_ALIASES.get(name, ()):
        if alias in values and values[alias] is not None:
            return float(values[alias])
    return float(default)


@dataclass
class LoadedModel:
    name: str
    estimator: Any = None
    features: List[str] = field(default_factory=list)
    source: str = "formula_fallback"  # "pkl" | "trained_from_csv" | "formula_fallback"
    metrics: Dict[str, float] = field(default_factory=dict)

    @property
    def available(self) -> bool:
        return self.estimator is not None

    def vector(self, values: Dict[str, Any]) -> List[float]:
        return [_lookup(values, f) for f in self.features]

    def info(self) -> Dict[str, Any]:
        return {"name": self.name, "source": self.source, "features": self.features, "metrics": self.metrics}


def _load_pickle(name: str, default_features: List[str]) -> Optional[LoadedModel]:
    path = MODELS_DIR / f"{name}.pkl"
    if not path.exists():
        return None
    try:
        try:
            import joblib  # type: ignore

            obj = joblib.load(path)
        except ImportError:
            with path.open("rb") as f:
                obj = pickle.load(f)
        features = list(default_features)
        if isinstance(obj, dict):
            features = list(obj.get("features") or features)
            obj = obj["model"]
        names_in = getattr(obj, "feature_names_in_", None)
        if names_in is not None:
            features = [str(n) for n in names_in]
        log.info("Loaded %s from %s (features=%s)", name, path, features)
        return LoadedModel(name=name, estimator=obj, features=features, source="pkl")
    except Exception as exc:  # corrupt pickle / version mismatch -> train instead
        log.warning("Could not load %s (%s); falling back to in-process training", path, exc)
        return None


# ---------------------------------------------------------------------------
# Training (deterministic) — shared with scripts/train_models.py
# ---------------------------------------------------------------------------

def _xy(rows: List[Dict[str, str]], features: List[str], target: str) -> Tuple[Any, Any]:
    import numpy as np

    X = np.array([[float(r[f]) for f in features] for r in rows], dtype=float)
    y = np.array([r[target] for r in rows])
    return X, y


def train_model_a(features: List[str], name: str) -> LoadedModel:
    import numpy as np
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import GroupShuffleSplit

    rows = load_csv_rows("table_a_myo_fatigue.csv")
    X, y = _xy(rows, features, "muscle_fatigue_score")
    y = y.astype(float)
    groups = np.array([r["subject_id"] for r in rows])
    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_SEED).split(X, y, groups))
    est = GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.05, random_state=RANDOM_SEED)
    est.fit(X[tr], y[tr])
    mae = float(np.mean(np.abs(est.predict(X[te]) - y[te])))
    est.fit(X, y)
    return LoadedModel(name, est, list(features), "trained_from_csv", {"holdout_mae": round(mae, 2)})


def train_model_b() -> LoadedModel:
    import numpy as np
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import train_test_split

    rows = load_csv_rows("table_b_lunar_eva_metabolic.csv")
    X, y = _xy(rows, MODEL_B_FEATURES, "metabolic_rate_watts")
    y = y.astype(float)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=RANDOM_SEED)
    est = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, random_state=RANDOM_SEED)
    est.fit(Xtr, ytr)
    mae = float(np.mean(np.abs(est.predict(Xte) - yte)))
    est.fit(X, y)
    return LoadedModel("model_b_metabolic", est, list(MODEL_B_FEATURES), "trained_from_csv", {"holdout_mae_w": round(mae, 1)})


def train_model_c() -> LoadedModel:
    import numpy as np
    from sklearn.model_selection import train_test_split
    from sklearn.tree import DecisionTreeClassifier

    rows = load_csv_rows("table_c_emergency_triage.csv")
    X, _ = _xy(rows, MODEL_C_FEATURES, "class_id")
    y = np.array([int(r["class_id"]) for r in rows])
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y)

    # Symptom dropout: in table C every ischemia row has short_breath=1, so a plain tree learns
    # "no short breath + dizzy -> syncope" and ignores ST / BP. A non-doctor helper will often
    # miss a symptom, so we add a seeded copy of the data with each symptom flag hidden at
    # p=0.35, forcing the tree to split on the objective vitals (ST elevation, systolic BP...).
    sym_idx = [MODEL_C_FEATURES.index(k) for k in ("chest_pain", "dizzy", "short_breath", "cold_sweat")]

    def augment(Xa, ya):
        rng = np.random.default_rng(RANDOM_SEED)
        Xd = Xa.copy()
        for i in sym_idx:
            Xd[rng.random(len(Xd)) < 0.35, i] = 0.0
        return np.vstack([Xa, Xd]), np.concatenate([ya, ya])

    est = DecisionTreeClassifier(max_depth=5, min_samples_leaf=10, random_state=RANDOM_SEED)
    est.fit(*augment(Xtr, ytr))
    acc = float(est.score(Xte, yte))
    Xte_d, yte_d = augment(Xte, yte)
    acc_dropout = float(est.score(Xte_d[len(Xte):], yte_d[len(Xte):]))
    est.fit(*augment(X, y))
    return LoadedModel("model_c_triage", est, list(MODEL_C_FEATURES), "trained_from_csv",
                       {"holdout_accuracy": round(acc, 3), "holdout_accuracy_missing_symptoms": round(acc_dropout, 3)})


def _obtain(name: str, features: List[str], trainer) -> LoadedModel:
    loaded = _load_pickle(name, features)
    if loaded:
        return loaded
    try:
        model = trainer()
        log.info("Trained %s from CSV %s", name, model.metrics)
        return model
    except Exception as exc:
        log.warning("Training %s failed (%s) — using formula fallback", name, exc)
        return LoadedModel(name=name, features=list(features))


# ---------------------------------------------------------------------------
# Public registry
# ---------------------------------------------------------------------------

class ModelRegistry:
    def __init__(self) -> None:
        self.model_a = _obtain("model_a_full", MODEL_A_FEATURES, lambda: train_model_a(MODEL_A_FEATURES, "model_a_full"))
        self.model_a_fallback = _obtain(
            "model_a_fallback", MODEL_A_FALLBACK_FEATURES,
            lambda: train_model_a(MODEL_A_FALLBACK_FEATURES, "model_a_fallback"),
        )
        self.model_b = _obtain("model_b_metabolic", MODEL_B_FEATURES, train_model_b)
        self.model_c = _obtain("model_c_triage", MODEL_C_FEATURES, train_model_c)

    def info(self) -> Dict[str, Any]:
        return {m.name: m.info() for m in (self.model_a, self.model_a_fallback, self.model_b, self.model_c)}

    @staticmethod
    def _predict_one(model: LoadedModel, values: Dict[str, Any]) -> float:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return float(model.estimator.predict([model.vector(values)])[0])

    # ---- Model A ---------------------------------------------------------------
    def predict_fatigue(self, values: Dict[str, Any], nirs_ok: bool = True) -> Tuple[float, str]:
        """Muscle Fatigue Score 0..100 (higher = more exhausted). Returns (score, model_used)."""
        model = self.model_a if nirs_ok else self.model_a_fallback
        if model.available:
            try:
                return _clamp(self._predict_one(model, values), 0.0, 100.0), model.name
            except Exception as exc:
                log.warning("%s predict failed: %s", model.name, exc)
        smo2 = _lookup(values, "calf_smo2_pct", 75.0)
        mdf = _lookup(values, "semg_mdf_shift_pct", 0.0)
        gait = _lookup(values, "imu_gait_asymmetry", 0.1)
        emg_part = _clamp(-mdf / 45.0, 0, 1) * 100
        gait_part = _clamp(gait / 0.35, 0, 1) * 100
        if nirs_ok:
            nirs_part = _clamp((85.0 - smo2) / 60.0, 0, 1) * 100
            score = 0.55 * nirs_part + 0.30 * emg_part + 0.15 * gait_part
        else:
            score = 0.75 * emg_part + 0.25 * gait_part
        return _clamp(score, 0.0, 100.0), f"{model.name}:formula"

    # ---- Model B ---------------------------------------------------------------
    def predict_metabolic_watts(self, speed_kmh: float, slope_deg: float, fatigue: float) -> Tuple[float, str]:
        values = {"speed_kmh": speed_kmh, "slope_deg": slope_deg, "muscle_fatigue_score": fatigue}
        if speed_kmh <= 0.05:
            # Standing still in the suit: resting suited metabolic rate (~Apollo station stops).
            return 150.0 + 0.4 * fatigue, "resting_suited"
        if self.model_b.available:
            try:
                return _clamp(self._predict_one(self.model_b, values), 100.0, 900.0), self.model_b.name
            except Exception as exc:
                log.warning("model_b predict failed: %s", exc)
        # Pandolf-style lunar approximation (1/6 g + suit mass).
        watts = 185.0 + 17.0 * max(slope_deg, 0.0) + 45.0 * (speed_kmh - 2.5) + 0.6 * fatigue
        return _clamp(watts, 120.0, 900.0), "model_b:formula"

    # ---- Model C ---------------------------------------------------------------
    def triage(self, values: Dict[str, Any]) -> Dict[str, Any]:
        model = self.model_c
        if model.available:
            try:
                return self._triage_tree(model, values)
            except Exception as exc:
                log.warning("model_c predict failed: %s", exc)
        return self._triage_rules(values)

    def _class_name(self, label: Any) -> str:
        if isinstance(label, str) and not label.isdigit():
            return label
        idx = int(label)
        return TRIAGE_CLASSES[idx] if 0 <= idx < len(TRIAGE_CLASSES) else str(label)

    def _triage_tree(self, model: LoadedModel, values: Dict[str, Any]) -> Dict[str, Any]:
        est = model.estimator
        x = model.vector(values)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            proba = list(est.predict_proba([x])[0])
        classes = [self._class_name(c) for c in est.classes_]
        ranked = sorted(zip(classes, proba), key=lambda p: (-p[1], classes.index(p[0])))
        primary = ranked[0][0]
        return {
            "primary_class": primary,
            "confidence": round(float(ranked[0][1]), 3),
            "ranked": [{"class": c, "probability": round(float(p), 3)} for c, p in ranked],
            "tree_path": self._explain_path(model, x, primary),
            "model": f"{model.name} ({model.source})",
        }

    @staticmethod
    def _explain_path(model: LoadedModel, x: List[float], primary: str) -> str:
        est = model.estimator
        tree = getattr(est, "tree_", None)
        if tree is None:
            return f"→ {primary}"
        node, parts, seen = 0, [], set()
        while tree.children_left[node] != tree.children_right[node]:
            fi = int(tree.feature[node])
            thr = float(tree.threshold[node])
            name = model.features[fi] if fi < len(model.features) else f"f{fi}"
            val = x[fi]
            go_left = val <= thr
            if name not in seen:  # keep the sentence short: first test of each feature only
                seen.add(name)
                label = FEATURE_LABELS.get(name, name)
                if name in BINARY_FEATURES:
                    parts.append(f"{label}: {'yes' if val > 0.5 else 'no'}")
                else:
                    parts.append(f"{label} {val:g} {'≤' if go_left else '>'} {thr:.3g}")
            node = tree.children_left[node] if go_left else tree.children_right[node]
        return " + ".join(parts) + f" → {primary}"

    @staticmethod
    def _triage_rules(v: Dict[str, Any]) -> Dict[str, Any]:
        st = _lookup(v, "st_elevation_mv")
        sys_bp = _lookup(v, "bp_sys", 120)
        spo2 = _lookup(v, "spo2", 98)
        resp = _lookup(v, "resp_rate", 15)
        chest = _lookup(v, "chest_pain") > 0.5
        scores = {c: 0.05 for c in TRIAGE_CLASSES}
        if st >= 0.1 or chest:
            scores["Acute Coronary Ischemia"] += 0.6 + (0.2 if st >= 0.1 else 0)
        if sys_bp < 95 and not chest:
            scores["Orthostatic Syncope"] += 0.6
        if resp > 28 and spo2 >= 90:
            scores["Hypercapnia CO2"] += 0.5
        if spo2 < 88:
            scores["Decompression Barotrauma"] += 0.5
        if max(scores.values()) <= 0.05:
            scores["Nominal"] = 0.9
        total = sum(scores.values())
        ranked = sorted(((c, s / total) for c, s in scores.items()), key=lambda p: -p[1])
        primary = ranked[0][0]
        return {
            "primary_class": primary,
            "confidence": round(ranked[0][1], 3),
            "ranked": [{"class": c, "probability": round(p, 3)} for c, p in ranked],
            "tree_path": f"ST {st:.2f} mV, BP {sys_bp:.0f}, SpO2 {spo2:.0f}%, chest pain {'yes' if chest else 'no'} → {primary} (rule fallback)",
            "model": "model_c:rules",
        }


def o2_burn_l_min(metabolic_w: float, fatigue_score: float) -> float:
    """Spec 4.2: O2 burn (L/min) ≈ (W / 335) × (1 + 0.25 × Fatigue Index)."""
    return (metabolic_w / 335.0) * (1.0 + 0.25 * _clamp(fatigue_score, 0, 100) / 100.0)


def finite(v: float, default: float = 0.0) -> float:
    return v if isinstance(v, (int, float)) and math.isfinite(v) else default
