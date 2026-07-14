import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Ensure backend/ is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("DATABASE_URL", "postgresql://bookkeeper:bookkeeper@localhost:5432/books_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

from database import Base, get_db  # noqa: E402
from main import app               # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(TEST_DATABASE_URL)
TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def setup_schema():
    """Create all tables once; drop them after the full test run."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """Each test gets a session that is rolled back on teardown."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestSession(bind=connection)

    def override():
        yield session

    app.dependency_overrides[get_db] = override
    yield session

    app.dependency_overrides.pop(get_db, None)
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    return TestClient(app, raise_server_exceptions=True)


# ── Auth helpers ──────────────────────────────────────────────
import uuid  # noqa: E402


def make_user(suffix: str | None = None):
    s = suffix or uuid.uuid4().hex[:8]
    return {
        "email": f"test_{s}@example.com",
        "username": f"user_{s}",
        "password": "password123",
    }


def register(client: TestClient, suffix: str | None = None) -> dict:
    """Register a user and return the full token response dict."""
    payload = make_user(suffix)
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def auth_headers(token_response: dict) -> dict:
    return {"Authorization": f"Bearer {token_response['access_token']}"}
