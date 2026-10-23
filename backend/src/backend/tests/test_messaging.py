from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.config import settings
from backend.main import app
from backend.models.db import ChannelLink, Inbox, ReminderLog
from backend.models.schema import AgentReply
from backend.services import conversation, inbox, linking, workouts
from backend.utils.database import SessionLocal
from backend.utils.messaging import IncomingMessage
from backend.utils.telegram import TelegramGateway
from backend.workers import inbox_worker, reminders


class FakeGateway(TelegramGateway):
    def __init__(self):
        super().__init__(token="x")
        self.sent: list[tuple[str, str]] = []
        self.buttons: list = []

    def send_text(self, external_id, text):
        self.sent.append((external_id, text))

    def send_buttons(self, external_id, text, buttons):
        self.sent.append((external_id, text))
        self.buttons.append(buttons)

    def answer_callback(self, callback_id): ...


def update(update_id, chat_id, text):
    return {"update_id": update_id, "message": {"chat": {"id": chat_id, "type": "private"}, "text": text}}


def enqueue(payload):
    gw = TelegramGateway(token="x")
    with SessionLocal.begin() as s:
        return inbox.enqueue(s, gw.parse_update(payload), payload)


def link_user(db, user, chat_id="777"):
    code, _ = linking.create_link_code(db, user)
    assert linking.consume_link_code(db, code, chat_id).status == "linked"
    db.commit()


# --- webhook ------------------------------------------------------------------------------------


def test_webhook_rejects_wrong_secret():
    client = TestClient(app)
    res = client.post("/webhook/telegram", json=update(1, 1, "oi"), headers={"x-telegram-bot-api-secret-token": "nope"})
    assert res.status_code == 401
    assert client.post("/webhook/telegram", json=update(1, 1, "oi")).status_code == 401


def test_webhook_is_idempotent_by_update_id(db):
    client = TestClient(app)
    headers = {"x-telegram-bot-api-secret-token": settings.telegram_webhook_secret}
    for _ in range(3):
        assert client.post("/webhook/telegram", json=update(42, 9, "oi"), headers=headers).status_code == 200
    assert db.query(Inbox).count() == 1


def test_non_text_updates_are_ignored(db):
    client = TestClient(app)
    headers = {"x-telegram-bot-api-secret-token": settings.telegram_webhook_secret}
    client.post("/webhook/telegram", json={"update_id": 5, "edited_message": {}}, headers=headers)
    assert db.query(Inbox).count() == 0


# --- fila ---------------------------------------------------------------------------------------


def test_claim_keeps_per_chat_order_and_blocks_while_processing(db):
    enqueue(update(1, 10, "a"))
    enqueue(update(2, 10, "b"))
    enqueue(update(3, 20, "c"))
    with SessionLocal.begin() as s:
        first = inbox.claim_next(s)
    with SessionLocal.begin() as s:
        second = inbox.claim_next(s)  # chat 10 está ocupado, então vem o chat 20
        none_left = inbox.claim_next(s)
    assert (first.update_id, second.update_id, none_left) == (1, 3, None)
    with SessionLocal.begin() as s:
        inbox.mark_done(s, first.id)
    with SessionLocal.begin() as s:
        assert inbox.claim_next(s).update_id == 2


def test_retry_with_backoff_then_failed(db):
    enqueue(update(1, 10, "a"))
    now = datetime.now(UTC)
    statuses = []
    for _ in range(inbox.MAX_ATTEMPTS):
        with SessionLocal.begin() as s:
            row = inbox.claim_next(s, now=now)
            assert row is not None
            statuses.append(inbox.mark_failed(s, row.id, "boom", now=now))
        now += timedelta(hours=1)
    assert statuses == ["pending"] * (inbox.MAX_ATTEMPTS - 1) + ["failed"]
    with SessionLocal.begin() as s:
        assert inbox.claim_next(s, now=now) is None


def test_backoff_blocks_immediate_retry(db):
    enqueue(update(1, 10, "a"))
    now = datetime.now(UTC)
    with SessionLocal.begin() as s:
        row = inbox.claim_next(s, now=now)
        inbox.mark_failed(s, row.id, "boom", now=now)
    with SessionLocal.begin() as s:
        assert inbox.claim_next(s, now=now) is None
        assert inbox.claim_next(s, now=now + timedelta(seconds=6)) is not None


# --- conversa -----------------------------------------------------------------------------------


def test_unknown_chat_gets_site_link_and_start_with_code_links(db, make_user):
    user = make_user()
    code, _ = linking.create_link_code(db, user)
    db.commit()
    gw = FakeGateway()
    enqueue(update(1, 55, "/start"))
    enqueue(update(2, 55, f"/start {code}"))
    assert inbox_worker.process_one(gw) and inbox_worker.process_one(gw)
    assert settings.site_url in gw.sent[0][1]
    assert "vinculada" in gw.sent[1][1]
    assert db.query(ChannelLink).one().external_id == "55"
    enqueue(update(3, 66, f"/start {code}"))  # código já usado
    inbox_worker.process_one(gw)
    assert "inválido" in gw.sent[-1][1]


def test_daily_limit_blocks_agent(db, make_user, monkeypatch):
    user = make_user()
    link_user(db, user)
    monkeypatch.setattr(settings, "daily_message_limit", 2)
    calls = []
    monkeypatch.setattr("backend.agents.iron_agent.respond", lambda uid, text: calls.append(text) or AgentReply("ok"))
    gw = FakeGateway()
    for i in range(1, 5):
        conversation.handle_message(gw, IncomingMessage(i, "telegram", "777", text=f"m{i}"))
    assert calls == ["m1", "m2"]
    assert [t for _, t in gw.sent].count(conversation.LIMIT_NOTICE) == 1


def test_worker_marks_done_and_replies(db, make_user, monkeypatch):
    user = make_user()
    link_user(db, user)
    monkeypatch.setattr("backend.agents.iron_agent.respond", lambda uid, text: AgentReply("anotado"))
    gw = FakeGateway()
    enqueue(update(1, 777, "supino reto 10 reps 20kg"))
    assert inbox_worker.process_one(gw) is True
    assert inbox_worker.process_one(gw) is False
    assert gw.sent == [("777", "anotado")]
    assert db.query(Inbox).one().status == "done"


# --- lembretes ----------------------------------------------------------------------------------


def _setup_reminder_user(db, make_user):
    user = make_user()
    ws, _ = workouts.build_specs(db, user.id, [{"name": "Peito", "weekday": 3, "exercises": [{"name": "Supino reto"}]}])
    workouts.save_routine(db, user.id, ws)
    link_user(db, user)
    return user


# 2026-10-22 é quinta-feira (weekday 3); 18:00 em São Paulo = 21:00 UTC
EVENING = datetime(2026, 10, 22, 21, 5, tzinfo=UTC)


def test_reminder_sent_once_per_day(db, make_user):
    _setup_reminder_user(db, make_user)
    gw = FakeGateway()
    assert reminders.send_due_reminders(gw, EVENING) == 1
    assert reminders.send_due_reminders(gw, EVENING + timedelta(minutes=1)) == 0  # ex.: reinício do processo
    assert len(gw.sent) == 1 and "Treino A" in gw.sent[0][1]
    assert db.query(ReminderLog).count() == 1


def test_reminder_skipped_before_time_other_weekday_or_after_training(db, make_user):
    user = _setup_reminder_user(db, make_user)
    gw = FakeGateway()
    assert reminders.send_due_reminders(gw, EVENING - timedelta(hours=1)) == 0
    assert reminders.send_due_reminders(gw, EVENING + timedelta(days=1)) == 0  # sexta
    workouts.log_set(db, user, "supino reto", 10, 20, now=EVENING - timedelta(hours=2))
    db.commit()
    assert reminders.send_due_reminders(gw, EVENING) == 0
    assert gw.sent == []


def test_reminder_uses_user_training_days_over_workout_hint(db, make_user):
    user = _setup_reminder_user(db, make_user)  # treino com dica de quinta (3)
    user.training_days = [4]  # sexta
    db.commit()
    gw = FakeGateway()
    assert reminders.send_due_reminders(gw, EVENING) == 0  # quinta: não é dia de treino
    assert reminders.send_due_reminders(gw, EVENING + timedelta(days=1)) == 1  # sexta


def test_reply_blocks_are_sent_as_separate_messages_with_buttons_on_last():
    from backend.services.conversation import send_reply

    class Gw:
        def __init__(self):
            self.calls = []

        def send_text(self, chat_id, text):
            self.calls.append(("text", text))

        def send_buttons(self, chat_id, text, buttons):
            self.calls.append(("buttons", text))

    gw = Gw()
    send_reply(gw, "1", "Anotado!\n\nQuantas séries no próximo?", [("Ok", "x:1")])
    assert gw.calls == [("text", "Anotado!"), ("buttons", "Quantas séries no próximo?")]


def test_reminder_lists_goals_grouped_and_last_session(db, make_user):
    user = _setup_reminder_user(db, make_user)
    user.name = "Fellipe Castro"
    workouts.log_set(db, user, "supino reto", 10, 20, now=EVENING - timedelta(days=7))
    workouts.log_set(db, user, "supino reto", 10, 20, now=EVENING - timedelta(days=7, minutes=-3))
    db.commit()
    gw = FakeGateway()
    assert reminders.send_due_reminders(gw, EVENING) == 1
    text = gw.sent[0][1]
    assert text.startswith("Bora treinar, Fellipe!") and "Hoje: Treino A — Peito" in text
    assert "1. Supino reto — 3 séries" in text and "Metas: 2x 11x20kg · sem meta" in text
    assert "Última vez: 15/10 · 2 séries, 400kg" in text


def test_reminder_first_time_has_no_goals_and_long_break_opening():
    summary = {
        "letter": "A",
        "name": "Peito",
        "exercises": [{"name": "Supino reto", "sets": [{"set": 1, "reps": None, "kg": None}]}],
        "last_session": None,
        "days_since_training": 9,
    }
    text = reminders.format_reminder(summary, None)
    assert text.startswith("Faz 9 dias") and "Primeira vez nesse exercício" in text


def test_idle_session_summary_sent_once(db, make_user):
    user = _setup_reminder_user(db, make_user)
    workouts.log_set(db, user, "supino reto", 10, 20, now=EVENING)
    db.commit()
    gw = FakeGateway()
    assert reminders.send_idle_summaries(gw, EVENING + timedelta(minutes=30)) == 0  # ainda treinando
    assert reminders.send_idle_summaries(gw, EVENING + timedelta(minutes=50)) == 1
    assert reminders.send_idle_summaries(gw, EVENING + timedelta(minutes=60)) == 0  # dedup
    assert "Treino A concluído" in gw.sent[0][1]
