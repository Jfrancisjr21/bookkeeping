from tests.conftest import register, auth_headers, make_user


def test_register_returns_token(client):
    res = client.post("/auth/register", json=make_user())
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "email" in data["user"]


def test_register_duplicate_email(client):
    payload = make_user("dup")
    client.post("/auth/register", json=payload)
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"]


def test_register_duplicate_username(client):
    u1 = make_user("usr1")
    u2 = make_user("usr2")
    u2["username"] = u1["username"]
    client.post("/auth/register", json=u1)
    res = client.post("/auth/register", json=u2)
    assert res.status_code == 400
    assert "already taken" in res.json()["detail"]


def test_register_invalid_email(client):
    payload = make_user()
    payload["email"] = "not-an-email"
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 422


def test_register_short_password(client):
    payload = make_user()
    payload["password"] = "short"
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 400


def test_login_success(client):
    tok = register(client)
    res = client.post("/auth/login", json={
        "email": tok["user"]["email"],
        "password": "password123",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_wrong_password(client):
    tok = register(client)
    res = client.post("/auth/login", json={
        "email": tok["user"]["email"],
        "password": "wrongpassword",
    })
    assert res.status_code == 401


def test_login_unknown_email(client):
    res = client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "password123",
    })
    assert res.status_code == 401


def test_refresh(client):
    tok = register(client)
    res = client.post("/auth/refresh", headers=auth_headers(tok))
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_protected_endpoint_without_token(client):
    res = client.get("/books/")
    assert res.status_code == 401
