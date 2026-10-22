import time
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from backend.api import auth
from backend.config import settings
from backend.main import app
from backend.services import workouts

client = TestClient(app)
NOW = datetime.now(UTC)


@pytest.fixture
def signer(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return type("K", (), {"key": key.public_key()})()

    monkeypatch.setattr(auth, "_jwks_client", lambda: FakeJwks())

    def sign(sub="user_api", **claims):
        payload = {"sub": sub, "iss": settings.clerk_issuer, "iat": int(time.time()), "exp": int(time.time()) + 300, **claims}
        return jwt.encode(payload, key, algorithm="RS256")

    return sign


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_requires_valid_jwt(signer):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers=headers("garbage")).status_code == 401
    assert client.get("/me", headers=headers(signer(iss="https://evil.example"))).status_code == 401
    assert client.get("/me", headers=headers(signer(exp=int(time.time()) - 600))).status_code == 401


def test_first_access_creates_user(signer):
    res = client.get("/me", headers=headers(signer()))
    assert res.status_code == 200
    body = res.json()
    assert body["linked"] is False and body["telegram"] is None and body["bot_username"] == "iron_test_bot"
    assert client.get("/me", headers=headers(signer())).json()["id"] == body["id"]


def test_link_code_and_status(signer):
    h = headers(signer())
    body = client.post("/link-code", headers=h).json()
    assert body["code"].startswith("IRON-") and len(body["code"]) == 11
    assert body["deep_link"] == f"https://t.me/iron_test_bot?start={body['code']}"
    from backend.services import linking
    from backend.utils.database import SessionLocal

    with SessionLocal.begin() as s:
        assert linking.consume_link_code(s, body["code"], "321").status == "linked"
    me = client.get("/me", headers=h).json()
    assert me["linked"] is True and me["telegram"]["linked_at"]


def test_routine_sessions_dashboard_and_progress(signer):
    h = headers(signer())
    assert client.get("/routine", headers=h).json() == {"workouts": [], "next_workout_id": None, "reminder_time": "18:00:00"}

    put = client.put(
        "/routine",
        headers=h,
        json={
            "workouts": [
                {"name": "Peito", "weekday": 0, "exercises": [{"name": "Supino reto", "sets": 3}, {"name": "Tríceps corda"}]},
                {"name": "Costas", "exercises": [{"name": "Puxada frontal"}]},
            ]
        },
    )
    assert put.status_code == 200, put.text
    routine = put.json()
    assert [w["letter"] for w in routine["workouts"]] == ["A", "B"]
    assert routine["workouts"][0]["focus"] == "Peito e tríceps"
    assert routine["workouts"][0]["exercises"][0]["targets"][0] == {"set": 1, "reps": None, "kg": None}
    assert routine["next_workout_id"] == routine["workouts"][0]["id"]

    from backend.models.db import User
    from backend.utils.database import SessionLocal

    with SessionLocal.begin() as s:
        user = s.query(User).filter_by(clerk_id="user_api").one()
        for week in range(3):
            day = NOW - timedelta(weeks=week)
            workouts.log_set(s, user, "supino reto", 10 + week, 20 + week * 5, now=day)
            workouts.log_set(s, user, "supino reto", 8, 30, now=day + timedelta(minutes=5))

    after = client.get("/routine", headers=h).json()
    assert after["workouts"][0]["exercises"][0]["targets"][0]["reps"] is not None
    assert after["next_workout_id"] == after["workouts"][1]["id"]

    sessions = client.get("/sessions?limit=2", headers=h).json()
    assert len(sessions) == 2 and sessions[0]["workout"] == "Peito" and sessions[0]["volume"] > 0
    assert sessions[0]["sets"][0]["exercise"] == "Supino reto"

    dash = client.get("/dashboard", headers=h).json()
    assert dash["stats"]["workouts_month"] >= 1 and len(dash["weekly"]) == 6
    assert dash["one_rm"]["series"][0]["name"] == "Supino reto"

    assert client.get("/exercises", headers=h).json()[:1] == ["Puxada frontal"]
    prog = client.get("/progress/Supino reto", headers=h).json()
    assert prog["exercise"] == "Supino reto" and len(prog["points"]) >= 2 and prog["summary"]["kg"] > 0
    assert client.get("/progress/inexistente", headers=h).status_code == 404


def test_put_routine_validation(signer):
    h = headers(signer())
    assert client.put("/routine", headers=h, json={"workouts": []}).status_code == 422
    amb = client.put("/routine", headers=h, json={"workouts": [{"name": "A", "exercises": [{"name": "supino"}]}]})
    assert amb.status_code == 422 and amb.json()["detail"]["ambiguous"][0]["typed"] == "supino"


def test_settings_roundtrip_and_validation(signer):
    h = headers(signer())
    assert client.get("/settings", headers=h).json() == {"reminder_time": "18:00:00", "weight_increment_kg": 5.0, "timezone": "America/Sao_Paulo"}
    ok = client.put("/settings", headers=h, json={"reminder_time": "07:30", "weight_increment_kg": 2.5, "timezone": "America/Manaus"})
    assert ok.status_code == 200 and ok.json()["reminder_time"] == "07:30:00"
    assert client.put("/settings", headers=h, json={"reminder_time": None, "weight_increment_kg": 2.5, "timezone": "America/Manaus"}).json()["reminder_time"] is None
    assert client.put("/settings", headers=h, json={"reminder_time": None, "weight_increment_kg": 2.5, "timezone": "Marte/Olympus"}).status_code == 422
    assert client.put("/settings", headers=h, json={"reminder_time": None, "weight_increment_kg": 99, "timezone": "America/Manaus"}).status_code == 422


def test_increment_setting_changes_progression(signer):
    h = headers(signer())
    client.put("/settings", headers=h, json={"reminder_time": None, "weight_increment_kg": 2.5, "timezone": "America/Sao_Paulo"})
    from backend.models.db import Target, User
    from backend.services.catalog import resolve_exercise
    from backend.utils.database import SessionLocal

    with SessionLocal.begin() as s:
        user = s.query(User).filter_by(clerk_id="user_api").one()
        ex = resolve_exercise(s, user.id, "supino reto").exercise
        s.add(Target(user_id=user.id, exercise_id=ex.id, set_number=1, reps=12, weight_kg=30))
        s.flush()
        res = workouts.log_set(s, user, "supino reto", 12, 30)
    assert res["next_target"] == {"reps": 8, "kg": 32.5}


def test_delete_account_removes_everything(signer):
    h = headers(signer())
    client.put("/routine", headers=h, json={"workouts": [{"name": "A", "exercises": [{"name": "Supino reto"}]}]})
    assert client.delete("/me", headers=h).status_code == 204
    from backend.models.db import Routine, User
    from backend.utils.database import SessionLocal

    with SessionLocal() as s:
        assert s.query(User).filter_by(clerk_id="user_api").count() == 0
        assert s.query(Routine).count() == 0
    assert client.get("/me", headers=h).json()["id"]  # token ainda válido recria a conta vazia


def test_cors_allows_configured_origin():
    res = client.options("/me", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
