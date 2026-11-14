import os
import json

DATA_DIR = r"D:\PycharmProject\nasa_hakaton\data"
THRESHOLDS_FILE = os.path.join(DATA_DIR, "thresholds.json")
EXCERPTS_FILE = os.path.join(DATA_DIR, "nasa_std_3001_excerpts.json")

def build_thresholds_and_excerpts():
    print("=== Building thresholds.json and nasa_std_3001_excerpts.json ===")
    
    thresholds = {
        "metadata": {
            "source": "NASA-STD-3001 Vol 1 & 2 / Human Health and Performance / OCHMO-TB-004",
            "project": "A.E.G.I.S. v4.0",
            "version": "1.0.0"
        },
        "scales": {
            "astronaut_input_scale": "0..10",
            "system_health_scale": "0..100",
            "green_nominal": [80, 100],
            "yellow_caution": [60, 79],
            "red_critical": [0, 59]
        },
        "critical_clinical_rules": {
            "nitroglycerin_block": {
                "condition": "systolic_bp < 90",
                "action": "HARD_BLOCK_ADMINISTRATION",
                "alert_text": "⛔ DON'T GIVE NITROGLYCERIN! Risk of fatal cardiogenic collapse"
            },
            "oxygen_surge": {
                "condition": "spo2 < 92",
                "action": "TRIGGER_HIGH_FLOW_O2",
                "alert_text": "🚨 CRITICAL HYPOXEMIA: Initiating high-flow 100% O2 surge protocol"
            },
            "co2_alarm": {
                "condition": "co2_pp_mmhg > 7.5",
                "action": "TRIGGER_SUIT_PURGE",
                "alert_text": "⚠️ ELEVATED CO2 DETECTED: Check scrubber cartridge and initiate suit purge"
            }
        },
        "vitals_ranges": {
            "hr": {"nominal": [60, 100], "caution": [101, 135], "critical_low": 45, "critical_high": 165, "unit": "bpm"},
            "bp_sys": {"nominal": [95, 135], "caution": [90, 94], "critical_low": 90, "critical_high": 180, "unit": "mmHg"},
            "bp_dia": {"nominal": [60, 85], "caution": [86, 95], "critical_low": 50, "critical_high": 110, "unit": "mmHg"},
            "spo2": {"nominal": [95, 100], "caution": [92, 94], "critical_low": 92, "unit": "%"},
            "resp_rate": {"nominal": [12, 20], "caution": [21, 28], "critical_high": 32, "unit": "breaths/min"},
            "temp": {"nominal": [36.3, 37.2], "caution": [37.3, 38.0], "critical_low": 35.0, "critical_high": 38.5, "unit": "°C"},
            "blood_sugar_mgdl": {"nominal": [75, 115], "caution": [116, 140], "critical_low": 60, "critical_high": 180, "unit": "mg/dL"}
        },
        "eva_spacesuit_plss": {
            "tank_capacity_liters": 750.0,
            "emergency_reserve_liters": 150.0,
            "walk_back_warning_minutes": 15.0,
            "walk_back_critical_minutes": 5.0,
            "max_safe_slope_deg": 22.0
        },
        "environments": {
            "spacecraft_mars_transit": {
                "gravity": 0.0,
                "radiation_hazard": "high",
                "isolation_factor": 1.0,
                "baseline_shift": {"hr": 4, "bp_sys": -5, "smo2": -3, "cortisol": 15}
            },
            "space_station_orbital": {
                "gravity": 0.0,
                "radiation_hazard": "moderate",
                "isolation_factor": 0.3,
                "baseline_shift": {"hr": 2, "bp_sys": -3, "smo2": -2, "cortisol": 5}
            },
            "pressurized_rover": {
                "gravity": 0.166,
                "radiation_hazard": "moderate",
                "isolation_factor": 0.6,
                "baseline_shift": {"hr": 3, "bp_sys": -2, "smo2": -1, "cortisol": 8}
            },
            "lunar_base_habitat": {
                "gravity": 0.166,
                "radiation_hazard": "low",
                "isolation_factor": 0.4,
                "baseline_shift": {"hr": 1, "bp_sys": 0, "smo2": 0, "cortisol": 3}
            },
            "surface_eva_spacesuit": {
                "gravity": 0.166,
                "radiation_hazard": "high",
                "isolation_factor": 0.8,
                "baseline_shift": {"hr": 15, "bp_sys": 8, "smo2": -8, "cortisol": 25}
            }
        }
    }
    
    with open(THRESHOLDS_FILE, "w", encoding="utf-8") as f:
        json.dump(thresholds, f, indent=2, ensure_ascii=False)
    print(f"Saved {THRESHOLDS_FILE}")
    
    excerpts = {
        "NASA-STD-3001-VOL-1-EVAFITNESS": {
            "title": "NASA-STD-3001 Section 4.2: EVA Crewmember Physiological Readiness",
            "rule": "Crewmembers scheduled for Extravehicular Activity must demonstrate an EVA Readiness Score >= 85/100, calf muscle oxygen reserve >= 45%, and sleep duration >= 6.5 hours in the preceding 24-hour cycle. Any identified masking between subjective reporting and objective biometrics mandates Commander schedule reassignment."
        },
        "NASA-STD-3001-VOL-2-CARDIO": {
            "title": "NASA-STD-3001 Section 6.3: Acute Cardiovascular Events and Nitroglycerin Administration",
            "rule": "In the event of suspected acute myocardial ischemia or angina, nitroglycerin shall NEVER be administered if measured systolic blood pressure is below 90 mmHg. Vasodilation in the presence of cardiogenic hypotension risks fatal hemodynamic collapse. Automated External Defibrillator (AED) and high-flow oxygen shall be readied immediately."
        },
        "NASA-STD-3001-VOL-2-HYPOXIA": {
            "title": "NASA-STD-3001 Section 6.1: Respiratory Monitoring & Hypoxia Countermeasures",
            "rule": "Arterial oxygen saturation (SpO2) falling below 92% represents an urgent operational threshold requiring immediate intervention. If SpO2 < 88%, the crewmember is in severe decompensation, requiring 100% supplemental oxygen delivery and immediate habitat ingress."
        },
        "NASA-OCHMO-TB-004-CO2": {
            "title": "NASA OCHMO Technical Bulletin TB-004: Carbon Dioxide In-Suit Limits",
            "rule": "Spacesuit partial pressure of CO2 shall be maintained below 4.0 mmHg during nominal EVA. Excursions above 7.5 mmHg induce hypercapnic cognitive impairment, headache, and ventilatory fatigue, demanding immediate termination of surface activities."
        },
        "NASA-STD-3001-VOL-1-SLEEP": {
            "title": "NASA-STD-3001 Section 5.1: Circadian Rhythm and Sleep Deficit",
            "rule": "Cumulative sleep deficit exceeding 6 hours across a 72-hour window impairs cognitive vigilance, reaction time, and fine motor control. Astronauts with PVT latency increase > 2.0 SD shall not be cleared for safety-critical robotic or surface operations."
        },
        "NASA-STD-3001-VOL-1-MUSCLE": {
            "title": "NASA-STD-3001 Section 4.3: Musculoskeletal Conditioning and Recovery",
            "rule": "Soleus and gastrocnemius muscular endurance degrades at approximately 1.0-1.5% per week of spaceflight without targeted countermeasures. Evening recovery protocols including pneumatic compression, hydration with isotonic electrolytes, and neuromuscular stimulation restore microvascular compliance."
        }
    }
    
    with open(EXCERPTS_FILE, "w", encoding="utf-8") as f:
        json.dump(excerpts, f, indent=2, ensure_ascii=False)
    print(f"Saved {EXCERPTS_FILE}")

if __name__ == "__main__":
    build_thresholds_and_excerpts()
