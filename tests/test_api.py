import time

from tests.conftest import wait_for


def test_health_and_data(client):
    assert client.get("/health").json()["status"] == "ok"
    sc = client.get("/scenarios").json()
    assert set(sc["scenarios"]) >= {"normal_walk", "steep_climb", "fall_in_crater", "chest_pain", "tired_says_fine", "reset_all"}
    hist = client.get("/crew/A/history").json()
    assert hist["id"] == "Crew_A" and len(hist["history"]) == 14
    assert client.get("/crew/Crew_Z/history").status_code == 404
    assert len(client.get("/route").json()["points"]) == 100


def test_triage_chest_pain_hard_rules(client):
    body = {
        "crew": "Crew_A",
        "vitals": {"hr": 118, "sys": 82, "dia": 50, "spo2": 94.5, "resp": 24, "st": 0.286, "temp": 36.8},
        "symptom_flags": {"chest_pain": True, "cold_sweat": True, "dizzy": True},
    }
    r = client.post("/triage", json=body).json()
    assert r["primary_class"] == "Acute Coronary Ischemia"
    assert r["dont_give_list"][0]["drug"] == "Nitroglycerin"
    assert "82/50" in r["dont_give_list"][0]["banner"]
    assert r["flight_surgeons_queued"] is True
    assert r["tree_path_why"]
    assert all(c["class"] != r["primary_class"] for c in r["ranked_other_classes"])
    events = client.get("/events").json()["events"]
    assert any("Nitroglycerin blocked (BP 82/50)" in e["text"] for e in events)


def test_triage_low_spo2_prepends_oxygen(client):
    body = {"crew": "B", "vitals": {"hr": 100, "sys": 120, "dia": 80, "spo2": 88, "resp": 28, "st": 0.0, "temp": 36.7},
            "transcript": "he cannot breathe and he is dizzy"}
    r = client.post("/triage", json=body).json()
    assert r["protocol_steps"][0]["title"].startswith("Apply 100% O₂ mask at 4 L/min")
    assert r["protocol_steps"][0]["step"] == 1
    assert r["symptom_flags"]["short_breath"] and r["symptom_flags"]["dizzy"]
    assert r["dont_give_list"] == []


def test_evening_mismatch_and_quests(client):
    base = {"crew": "Crew_A", "sleep": 9, "energy": 9, "mood": 9, "pain_free": 9, "nutrition": 9,
            "blood_sugar_mgdl": 108, "bp": "118/76", "temp": 36.8}
    r0 = client.post("/evening", json=base).json()
    assert r0["mismatch_detected"] is True and r0["mismatch_text"]
    assert r0["band"] in ("amber", "red")
    assert len(r0["organ_scores_6"]) == 6
    assert len(r0["forecast_curve_no_rest"]) == len(r0["forecast_curve_with_quests"]) == len(r0["forecast_minutes"])
    r1 = client.post("/evening", json={**base, "completed_quests": ["hydration", "compression", "breathing"]}).json()
    assert r1["readiness_score"] > r0["readiness_score"]
    assert r1["readiness_score"] == r0["readiness_if_all_quests"]


def test_evening_validation(client):
    bad = {"crew": "A", "sleep": 11, "energy": 5, "mood": 5, "pain_free": 5, "nutrition": 5}
    assert client.post("/evening", json=bad).status_code == 422


def test_summary_offline_template_is_fast(client):
    ev = client.post("/evening", json={"crew": "Crew_A", "sleep": 9, "energy": 9, "mood": 9, "pain_free": 9, "nutrition": 9}).json()
    t0 = time.perf_counter()
    r = client.post("/summary", json=ev).json()
    assert time.perf_counter() - t0 < 1.0
    assert r["source"] == "DETERMINISTIC_FALLBACK_TEMPLATE"
    assert r["schedule_action"] == "SWAP_SCHEDULE"
    assert r["recommended_crew"]["crew"] != "Crew_A"
    assert "NASA-STD-3001" in r["commander_summary"]
    r2 = client.post("/summary", json={"crew": "Crew_C"}).json()
    assert r2["crew"] == "Crew_C"


def test_events_roundtrip(client):
    r = client.post("/events", json={"type": "visor_instruction", "crew": "Crew_A", "text": "Stop 60 s, then climb 30% slower"})
    assert r.status_code == 200 and "visor" in r.json()["text"]
    assert client.post("/events", json={"type": "ack"}).status_code == 400


def test_ws_chest_pain_jumps_console_to_emergency(client, chest_pain_frame):
    client.post("/reset")
    with client.websocket_connect("/ws/console") as console:
        hello = console.receive_json()
        assert hello["type"] == "hello" and set(hello["data"]["crews"]) == {"Crew_A", "Crew_B", "Crew_C", "Crew_D"}
        with client.websocket_connect("/ws/sensors") as phone:
            phone.send_json({**chest_pain_frame, "crew": "Crew_D"})
            assert phone.receive_json()["type"] == "ack"
        alarm = wait_for(console, "alarm_jump_to_emergency")
        tri = alarm["data"]["triage"]
        assert alarm["crew"] == "Crew_D"
        assert tri["primary_class"] == "Acute Coronary Ischemia"
        assert tri["dont_give_list"] and tri["flight_surgeons_queued"]


def test_ws_live_state_and_walk_back(client):
    client.post("/reset")
    with client.websocket_connect("/ws/console") as console:
        console.receive_json()
        client.post("/scenarios/steep_climb/play", json={"crew": "Crew_B", "rate_hz": 20})
        state = None
        for _ in range(30):
            state = wait_for(console, "state")
            if state["crew"] == "Crew_B" and state["data"]["packets_received"] >= 6:
                break
        d = state["data"]
        assert d["walk_back"]["display"] and d["walk_back"]["minutes"] >= 0
        assert 0 <= d["model_a"]["fatigue_score"] <= 100
        assert d["model_b"]["metabolic_rate_watts"] > 300
        assert d["traffic_light"] in ("green", "amber", "red")
        assert len(d["organ_scores"]) == 6
        client.post("/scenarios/stop", json={"crew": "Crew_B"})


def test_fall_countdown_and_ack(client):
    client.post("/reset")
    with client.websocket_connect("/ws/console") as console:
        console.receive_json()
        client.post("/sensors", json={"type": "fall", "crew": "Crew_C"})
        wait_for(console, "fall_countdown")
        client.post("/events", json={"type": "ack", "crew": "Crew_C"})
        wait_for(console, "ack")
        assert client.get("/crew/C").json()["alarm"] is None

        client.post("/sensors", json={"type": "fall", "crew": "Crew_C"})
        wait_for(console, "fall_countdown")
        esc = wait_for(console, "sos_auto_escalated")  # FALL_ACK_WINDOW_S=0.5 in tests
        assert esc["crew"] == "Crew_C"


def test_predict_all_endpoint_nominal_and_emergency(client):
    # 1. Test POST /predict_all with nominal telemetry
    nominal_body = {
        "crew": "Crew_A", "t": 0, "env": "surface_eva_spacesuit",
        "hr": 74.0, "sys": 118.0, "dia": 76.0, "spo2": 98.4, "resp": 15.0,
        "st": 0.005, "temp": 36.7, "smo2": 78.5, "emg_mdf": -2.0, "gait": 0.12,
        "slope": 3.0, "speed": 2.5, "o2_left": 680.0, "fall": 0, "nirs_ok": 1, "dizzy": 0,
    }
    r_nom = client.post("/predict_all", json=nominal_body)
    assert r_nom.status_code == 200
    d_nom = r_nom.json()
    assert d_nom["crew_id"] == "Crew_A"
    assert d_nom["health_score"] >= 80.0
    assert d_nom["band"] == "GREEN"
    assert d_nom["traffic_light"] == "green"
    assert "fatigue_score" in d_nom["model_a"]
    assert "muscle_fatigue_score" in d_nom["model_a"]
    assert "metabolic_rate_watts" in d_nom["model_b"]
    assert "walk_back_limit_min" in d_nom["model_b"]
    assert d_nom["model_c"]["primary_class"] == "Nominal"

    # 2. Test POST /api/predict_all with emergency chest pain
    emergency_body = {
        "crew": "Crew_B", "t": 15, "env": "surface_eva_spacesuit",
        "hr": 118.0, "sys": 82.0, "dia": 54.0, "spo2": 94.5, "resp": 24.0,
        "st": 0.286, "temp": 36.8, "smo2": 52.0, "emg_mdf": -18.0, "gait": 0.25,
        "slope": 4.0, "speed": 1.8, "o2_left": 550.0, "fall": 0, "nirs_ok": 1, "dizzy": 1,
        "chest_pain": 1, "cold_sweat": 1, "short_breath": 1,
    }
    r_em = client.post("/api/predict_all", json=emergency_body)
    assert r_em.status_code == 200
    d_em = r_em.json()
    assert d_em["crew_id"] == "Crew_B"
    assert d_em["band"] == "RED"
    assert d_em["traffic_light"] == "red"
    assert d_em["model_c"]["primary_class"] == "Acute Coronary Ischemia"
    assert d_em["model_c"]["dont_give_nitro"] is True
    assert len(d_em["model_c"]["dont_give_list"]) > 0
    assert d_em["model_c"]["flight_surgeons_alert"] is True


def test_shaking_phone_does_not_restart_fall_countdown(client):
    # Shake -> fall=1, tilt packet in between -> fall=0, shake again -> fall=1: still ONE countdown
    client.post("/reset")
    client.post("/sensors", json={"type": "telemetry", "crew": "Crew_B", "fall": 1})
    client.post("/sensors", json={"type": "telemetry", "crew": "Crew_B", "fall": 0, "slope": 10})
    client.post("/sensors", json={"type": "telemetry", "crew": "Crew_B", "fall": 1})
    falls = [e for e in client.get("/events").json()["events"] if e["type"] == "fall" and e["crew"] == "Crew_B"]
    assert len(falls) == 1
