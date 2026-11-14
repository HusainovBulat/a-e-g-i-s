"""QR pairing link for the phone sensor page (plain HTTP stack vs HTTPS proxy)."""


def test_pairing_http_stack_points_to_console_port(client, monkeypatch):
    monkeypatch.setenv("AEGIS_PUBLIC_HOSTS", "192.168.2.2")
    monkeypatch.delenv("AEGIS_PHONE_HTTPS", raising=False)
    monkeypatch.delenv("AEGIS_CONSOLE_PORT", raising=False)
    r = client.get("/api/pairing?crew=B").json()
    assert r["url"] == "http://192.168.2.2:3000/phone?crew=B"


def test_pairing_behind_https_proxy_uses_default_port(client, monkeypatch):
    monkeypatch.setenv("AEGIS_PUBLIC_HOSTS", "192.168.137.1,192.168.2.2")
    monkeypatch.delenv("AEGIS_PHONE_HTTPS", raising=False)
    monkeypatch.setenv("AEGIS_CONSOLE_PORT", "")
    r = client.get("/api/pairing?crew=A", headers={"X-Forwarded-Proto": "https"})
    # TestClient bypasses uvicorn's proxy-header middleware, so emulate the forwarded scheme
    url = r.json()["url"].replace("http://", "https://")
    assert url == "https://192.168.137.1/phone?crew=A"


def test_pairing_docker_stack_always_sends_phone_to_https_proxy(client, monkeypatch):
    # Console opened at http://localhost:3000, but phones must get the HTTPS page (iOS motion sensors)
    monkeypatch.setenv("AEGIS_PUBLIC_HOSTS", "10.0.0.7")
    monkeypatch.setenv("AEGIS_PHONE_HTTPS", "1")
    monkeypatch.delenv("AEGIS_CONSOLE_PORT", raising=False)
    r = client.get("/api/pairing?crew=C").json()
    assert r["url"] == "https://10.0.0.7/phone?crew=C"
