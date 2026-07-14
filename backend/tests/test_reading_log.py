from datetime import date
from tests.conftest import register, auth_headers


def test_log_empty_month(client):
    tok = register(client)
    res = client.get("/reading-log/?year=2026&month=7", headers=auth_headers(tok))
    assert res.status_code == 200
    assert res.json() == []


def test_mark_and_retrieve(client):
    tok = register(client)
    h = auth_headers(tok)
    res = client.post("/reading-log/2026-01-15", headers=h)
    assert res.status_code == 200
    assert res.json() == {"date": "2026-01-15", "marked": True}

    res = client.get("/reading-log/?year=2026&month=1", headers=h)
    assert "2026-01-15" in res.json()


def test_mark_idempotent(client):
    tok = register(client)
    h = auth_headers(tok)
    client.post("/reading-log/2026-02-10", headers=h)
    res = client.post("/reading-log/2026-02-10", headers=h)
    assert res.status_code == 200
    res = client.get("/reading-log/?year=2026&month=2", headers=h)
    assert res.json().count("2026-02-10") == 1


def test_unmark(client):
    tok = register(client)
    h = auth_headers(tok)
    client.post("/reading-log/2026-03-05", headers=h)
    res = client.delete("/reading-log/2026-03-05", headers=h)
    assert res.status_code == 200
    assert res.json() == {"date": "2026-03-05", "marked": False}

    res = client.get("/reading-log/?year=2026&month=3", headers=h)
    assert "2026-03-05" not in res.json()


def test_unmark_idempotent(client):
    tok = register(client)
    h = auth_headers(tok)
    res = client.delete("/reading-log/2026-04-01", headers=h)
    assert res.status_code == 200
    assert res.json()["marked"] is False


def test_cannot_mark_future_date(client):
    tok = register(client)
    future = date(date.today().year + 1, 1, 1).isoformat()
    res = client.post(f"/reading-log/{future}", headers=auth_headers(tok))
    assert res.status_code == 400


def test_invalid_date_format(client):
    tok = register(client)
    res = client.post("/reading-log/not-a-date", headers=auth_headers(tok))
    assert res.status_code == 422


def test_month_boundary(client):
    tok = register(client)
    h = auth_headers(tok)
    client.post("/reading-log/2025-12-31", headers=h)
    client.post("/reading-log/2026-01-01", headers=h)

    dec = client.get("/reading-log/?year=2025&month=12", headers=h).json()
    jan = client.get("/reading-log/?year=2026&month=1", headers=h).json()
    assert "2025-12-31" in dec
    assert "2026-01-01" not in dec
    assert "2026-01-01" in jan
    assert "2025-12-31" not in jan


def test_logs_are_user_scoped(client):
    tok1 = register(client)
    tok2 = register(client)
    client.post("/reading-log/2026-05-20", headers=auth_headers(tok1))
    res = client.get("/reading-log/?year=2026&month=5", headers=auth_headers(tok2))
    assert "2026-05-20" not in res.json()
