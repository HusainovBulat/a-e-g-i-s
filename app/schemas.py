"""Request bodies for the REST API (responses are plain dicts, documented in README)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TriageVitals(BaseModel):
    model_config = ConfigDict(extra="allow")
    hr: Optional[float] = None
    sys: Optional[float] = Field(None, description="Systolic BP, mmHg")
    dia: Optional[float] = Field(None, description="Diastolic BP, mmHg")
    spo2: Optional[float] = None
    resp: Optional[float] = None
    st: Optional[float] = Field(None, description="ST elevation (mV; values > 0.5 are treated as mm)")
    temp: Optional[float] = None
    co2_pp_mmhg: Optional[float] = None


class SymptomFlags(BaseModel):
    chest_pain: bool = False
    dizzy: bool = False
    short_breath: bool = False
    cold_sweat: bool = False
    fall_event: bool = False


class TriageRequest(BaseModel):
    crew: str = "Crew_A"
    vitals: TriageVitals = Field(default_factory=TriageVitals, description="Missing values are taken from live telemetry")
    symptom_flags: SymptomFlags = Field(default_factory=SymptomFlags)
    transcript: Optional[str] = Field(None, description="Voice transcript; keywords are matched into symptom flags")
    ultrasound_attached: bool = False
    readiness: Optional[float] = None

    @model_validator(mode="before")
    @classmethod
    def _adapt_symptoms(cls, data: Any) -> Any:
        if isinstance(data, dict):
            symptoms = data.get("symptoms")
            if isinstance(symptoms, (list, tuple)):
                flags = dict(data.get("symptom_flags") or {})
                flags.setdefault("chest_pain", "chest_pain" in symptoms)
                flags.setdefault("dizzy", "dizziness" in symptoms or "dizzy" in symptoms)
                flags.setdefault("short_breath", "shortness_of_breath" in symptoms or "short_breath" in symptoms)
                flags.setdefault("cold_sweat", "cold_sweat" in symptoms)
                flags.setdefault("fall_event", "fall" in symptoms or "fall_event" in symptoms)
                data["symptom_flags"] = flags
            if "text" in data and "transcript" not in data:
                data["transcript"] = data["text"]
        return data


class EveningRequest(BaseModel):
    crew: str = "Crew_A"
    sleep: float = Field(..., ge=0, le=10)
    energy: float = Field(..., ge=0, le=10)
    mood: float = Field(..., ge=0, le=10)
    pain_free: float = Field(..., ge=0, le=10)
    nutrition: float = Field(..., ge=0, le=10)
    blood_sugar_mgdl: Optional[float] = Field(None, ge=20, le=600)
    bp: Optional[Union[str, Dict[str, float]]] = Field(None, description="'120/80' or {sys, dia}")
    bp_sys: Optional[float] = Field(None, ge=40, le=260)
    bp_dia: Optional[float] = Field(None, ge=20, le=180)
    temp: Optional[float] = Field(None, ge=30, le=44)
    completed_quests: List[str] = Field(default_factory=list, description="hydration | compression | breathing")

    @model_validator(mode="before")
    @classmethod
    def _flatten_answers(cls, data: Any) -> Any:
        if isinstance(data, dict):
            answers = data.get("answers")
            if isinstance(answers, dict):
                for k in ("sleep", "energy", "mood", "pain_free", "nutrition"):
                    if k in answers and k not in data:
                        data[k] = answers[k]
            if "quest_ids" in data and "completed_quests" not in data:
                data["completed_quests"] = data["quest_ids"]
            if "body_temp_c" in data and "temp" not in data:
                data["temp"] = data["body_temp_c"]
        return data

    @model_validator(mode="after")
    def _split_bp(self) -> "EveningRequest":
        if self.bp is not None and (self.bp_sys is None or self.bp_dia is None):
            if isinstance(self.bp, str):
                try:
                    s, d = self.bp.replace(" ", "").split("/")
                    self.bp_sys, self.bp_dia = float(s), float(d)
                except ValueError as exc:
                    raise ValueError("bp must look like '120/80'") from exc
            else:
                self.bp_sys = self.bp.get("sys", self.bp.get("bp_sys"))
                self.bp_dia = self.bp.get("dia", self.bp.get("bp_dia"))
        return self


class SummaryRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    crew: Optional[str] = None
    evening: Optional[Dict[str, Any]] = Field(None, description="Result of POST /evening (defaults to the crew's last one)")
    offline: bool = Field(False, description="Force the deterministic template (no LLM call)")

    @model_validator(mode="before")
    @classmethod
    def _accept_raw_evening(cls, data: Any) -> Any:
        # Spec: "Input: evening check-in result JSON" — accept it unwrapped as well.
        if isinstance(data, dict) and "readiness_score" in data and "evening" not in data:
            return {"evening": data, "crew": data.get("crew_id") or data.get("crew"), "offline": data.get("offline", False)}
        return data


class EventRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str = Field(..., description="ack | sos | light | visor_instruction | commander_decision | environment_change | note")
    crew: Optional[str] = None
    text: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class ScenarioPlayRequest(BaseModel):
    crew: str = "Crew_A"
    rate_hz: float = Field(1.0, gt=0, le=50)
