from tests.conftest import register, auth_headers

BOOK = {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "isbn": "9780743273565",
    "cover_url": "https://example.com/cover.jpg",
    "status": "plan_to_read",
}


def _add_book(client, headers, overrides=None):
    payload = {**BOOK, **(overrides or {})}
    res = client.post("/books/", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_add_book(client):
    tok = register(client)
    h = auth_headers(tok)
    data = _add_book(client, h)
    assert data["title"] == BOOK["title"]
    assert data["author"] == BOOK["author"]
    assert data["id"] is not None


def test_list_books_empty(client):
    tok = register(client)
    res = client.get("/books/", headers=auth_headers(tok))
    assert res.status_code == 200
    assert res.json() == []


def test_list_books_with_status_filter(client):
    tok = register(client)
    h = auth_headers(tok)
    _add_book(client, h, {"status": "reading"})
    _add_book(client, h, {"status": "read"})
    res = client.get("/books/?status=reading", headers=h)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["status"] == "reading"


def test_get_book(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.get(f"/books/{book['id']}", headers=h)
    assert res.status_code == 200
    assert res.json()["id"] == book["id"]


def test_get_book_not_found(client):
    tok = register(client)
    res = client.get("/books/99999", headers=auth_headers(tok))
    assert res.status_code == 404


def test_get_book_other_users_book(client):
    tok1 = register(client)
    tok2 = register(client)
    book = _add_book(client, auth_headers(tok1))
    res = client.get(f"/books/{book['id']}", headers=auth_headers(tok2))
    assert res.status_code == 404


def test_update_book(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.patch(f"/books/{book['id']}", json={"rating": 5, "notes": "Loved it"}, headers=h)
    assert res.status_code == 200
    assert res.json()["rating"] == 5
    assert res.json()["notes"] == "Loved it"


def test_auto_set_date_read_on_status_read(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    assert book["date_read"] is None
    res = client.patch(f"/books/{book['id']}", json={"status": "read"}, headers=h)
    assert res.status_code == 200
    assert res.json()["date_read"] is not None


def test_explicit_date_read_not_overwritten(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.patch(
        f"/books/{book['id']}",
        json={"status": "read", "date_read": "2025-01-15"},
        headers=h,
    )
    assert res.status_code == 200
    assert res.json()["date_read"] == "2025-01-15"


def test_auto_set_started_reading_at(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    assert book["started_reading_at"] is None
    res = client.patch(f"/books/{book['id']}", json={"status": "reading"}, headers=h)
    assert res.status_code == 200
    assert res.json()["started_reading_at"] is not None


def test_invalid_rating(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.patch(f"/books/{book['id']}", json={"rating": 6}, headers=h)
    assert res.status_code == 422


def test_invalid_cover_url(client):
    tok = register(client)
    h = auth_headers(tok)
    payload = {**BOOK, "cover_url": "not-a-url"}
    res = client.post("/books/", json=payload, headers=h)
    assert res.status_code == 422


def test_delete_book(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.delete(f"/books/{book['id']}", headers=h)
    assert res.status_code == 204
    res = client.get(f"/books/{book['id']}", headers=h)
    assert res.status_code == 404


def test_delete_other_users_book(client):
    tok1 = register(client)
    tok2 = register(client)
    book = _add_book(client, auth_headers(tok1))
    res = client.delete(f"/books/{book['id']}", headers=auth_headers(tok2))
    assert res.status_code == 404


def test_add_journal_entry(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    res = client.post(
        f"/books/{book['id']}/journal",
        json={"text": "Really gripping start.", "page": 42},
        headers=h,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["text"] == "Really gripping start."
    assert data["page"] == 42
    assert "created_at" in data


def test_list_journal_entries(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    client.post(f"/books/{book['id']}/journal", json={"text": "Entry 1"}, headers=h)
    client.post(f"/books/{book['id']}/journal", json={"text": "Entry 2"}, headers=h)
    res = client.get(f"/books/{book['id']}/journal", headers=h)
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_journal_deleted_with_book(client):
    tok = register(client)
    h = auth_headers(tok)
    book = _add_book(client, h)
    client.post(f"/books/{book['id']}/journal", json={"text": "Entry"}, headers=h)
    client.delete(f"/books/{book['id']}", headers=h)
    # Journal entries cascade-deleted — a GET on the now-deleted book returns 404
    res = client.get(f"/books/{book['id']}/journal", headers=h)
    assert res.status_code == 404


def test_reading_goal_set_and_get(client):
    tok = register(client)
    h = auth_headers(tok)
    res = client.put("/goals/2026", json={"target": 24}, headers=h)
    assert res.status_code == 200
    assert res.json()["target"] == 24
    res = client.get("/goals/2026", headers=h)
    assert res.status_code == 200
    assert res.json()["target"] == 24


def test_reading_goal_no_goal_returns_zero(client):
    tok = register(client)
    res = client.get("/goals/2026", headers=auth_headers(tok))
    assert res.status_code == 200
    assert res.json()["target"] == 0


def test_reading_goal_delete(client):
    tok = register(client)
    h = auth_headers(tok)
    client.put("/goals/2026", json={"target": 10}, headers=h)
    res = client.delete("/goals/2026", headers=h)
    assert res.status_code == 204
    res = client.get("/goals/2026", headers=h)
    assert res.json()["target"] == 0
