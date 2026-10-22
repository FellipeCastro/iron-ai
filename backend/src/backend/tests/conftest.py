import os

TEST_DB = "iron_test"
ADMIN_URL = os.environ.get("TEST_ADMIN_DATABASE_URL", "postgresql://iron:iron@localhost:5433/iron")
os.environ["DATABASE_URL"] = ADMIN_URL.rsplit("/", 1)[0] + f"/{TEST_DB}"
os.environ.setdefault("CLERK_WEBHOOK_SECRET", "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=")
os.environ["TELEGRAM_BOT_TOKEN"] = "test-token"
os.environ["TELEGRAM_BOT_USERNAME"] = "iron_test_bot"
os.environ["TELEGRAM_WEBHOOK_SECRET"] = "hook-secret"
os.environ["OPENAI_API_KEY"] = "test"
os.environ["CLERK_SECRET_KEY"] = ""
os.environ["CLERK_PUBLISHABLE_KEY"] = "pk_test_bmF0aXZlLXdhbGxleWUtNzc2OC5jbGVyay5hY2NvdW50cy5kZXYk"

import psycopg  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from backend.models.db import Base  # noqa: E402
from backend.services.catalog import SEED, seed_catalog  # noqa: E402
from backend.utils.database import SessionLocal, engine  # noqa: E402


def _ensure_database() -> None:
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,)).fetchone()
        if not exists:
            conn.execute(f"CREATE DATABASE {TEST_DB}")


@pytest.fixture(scope="session", autouse=True)
def _schema():
    _ensure_database()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _clean(_schema):
    keep = {"exercises", "exercise_aliases"}
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables if t.name not in keep)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        conn.execute(text("DELETE FROM exercises WHERE canonical_name <> ALL(:names)"), {"names": list(SEED)})
    with SessionLocal.begin() as s:
        seed_catalog(s)
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s
        s.rollback()


@pytest.fixture
def make_user(db):
    from backend.models.db import User

    def _make(clerk_id="user_1", **kw):
        user = User(clerk_id=clerk_id, **kw)
        db.add(user)
        db.flush()
        return user

    return _make
