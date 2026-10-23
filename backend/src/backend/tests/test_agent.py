from typing import Any

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import RunnableLambda

from backend.agents import iron_agent
from backend.models.db import SetLog
from backend.services import workouts
from backend.utils import llm_pick


class ScriptedChat(BaseChatModel):
    """LLM de mentira: devolve respostas e intenções pré-definidas, na ordem."""

    responses: list[Any] = []
    intents: list[str] = []

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return ChatResult(generations=[ChatGeneration(message=item)])

    def bind_tools(self, tools, **kwargs):
        return self

    def with_structured_output(self, schema, **kwargs):
        return RunnableLambda(lambda _messages: schema(intent=self.intents.pop(0)))


def call(name, args, call_id="c1"):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


@pytest.fixture
def script(monkeypatch):
    llm = ScriptedChat()
    monkeypatch.setattr(llm_pick, "pick_llm", lambda level="low": llm)
    monkeypatch.setattr(iron_agent, "_graph", None)
    return llm


def set_rows(db):
    return db.query(SetLog).all()


def test_log_set_flow(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set"]
    script.responses = [
        call("log_set", {"exercise": "supino reto", "reps": 10, "kg": 10}),
        AIMessage("Série 1 de supino reto registrada: 10 x 10kg. Próxima meta: 11 x 10kg."),
    ]
    reply = iron_agent.respond(user.id, "supino reto 10 reps 10kg")
    assert "registrada" in reply.text and not reply.buttons
    rows = set_rows(db)
    assert len(rows) == 1 and rows[0].reps == 10


def test_correction_flow(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set", "correct_set"]
    script.responses = [
        call("log_set", {"exercise": "supino reto", "reps": 10, "kg": 10}),
        AIMessage("ok"),
        call("correct_last_set", {"kg": 25}),
        AIMessage("Corrigido para 25kg."),
    ]
    iron_agent.respond(user.id, "supino reto 10 reps 10kg")
    iron_agent.respond(user.id, "errei, foi 25kg")
    from backend.services.stats import list_sessions

    sets = list_sessions(db, user)[0]["sets"]
    assert [(s["reps"], s["kg"]) for s in sets] == [(10, 25.0)]


def test_ambiguous_exercise_asks_instead_of_logging(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set"]
    script.responses = [
        call("log_set", {"exercise": "supino", "reps": 10, "kg": 20}),
        AIMessage("Qual supino: reto, inclinado ou declinado?"),
    ]
    reply = iron_agent.respond(user.id, "supino 10 reps 20kg")
    assert "Qual supino" in reply.text
    assert set_rows(db) == []


def test_routine_is_saved_directly_and_returns_site_link(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["routine"]
    script.responses = [
        call(
            "save_routine",
            {
                "workouts": [{"name": "Peito", "weekday": 0, "exercises": [{"name": "supino reto", "sets": 4}]}],
                "training_days": [0, 2, 4],
                "reminder_time": "18:30",
            },
        ),
        AIMessage("Anotado! Confira em http://localhost:5173/app/treinos"),
    ]
    reply = iron_agent.respond(user.id, "segunda peito: supino reto 4 séries")
    assert "/app/treinos" in reply.text and not reply.buttons
    db.expire_all()
    assert workouts.active_routine(db, user.id).workouts[0].exercises[0].sets_count == 4
    assert user.training_days == [0, 2, 4] and user.reminder_time.strftime("%H:%M") == "18:30"


def test_failure_after_write_does_not_duplicate(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set"]
    script.responses = [call("log_set", {"exercise": "supino reto", "reps": 10, "kg": 10}), RuntimeError("openai fora do ar")]
    reply = iron_agent.respond(user.id, "supino reto 10 reps 10kg")
    assert "Anotei" in reply.text and len(set_rows(db)) == 1


def test_failure_before_write_raises_for_retry(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set"]
    script.responses = [RuntimeError("openai fora do ar")]
    with pytest.raises(RuntimeError):
        iron_agent.respond(user.id, "supino reto 10 reps 10kg")


def test_feedback_is_stored_without_llm_reply(db, make_user, script):
    from backend.models.db import Feedback

    user = make_user()
    db.commit()
    script.intents = ["feedback"]
    reply = iron_agent.respond(user.id, "adorei o app")
    assert "feedback" in reply.text
    assert db.query(Feedback).one().text == "adorei o app"


def test_batch_message_logs_every_set_with_numbers(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set"]
    script.responses = [
        AIMessage(
            content="",
            tool_calls=[
                {"name": "log_set", "args": {"exercise": "supino reto", "reps": r, "kg": kg, "set_number": n}, "id": f"c{n}"}
                for n, r, kg in [(1, 10, 20), (2, 10, 30), (3, 10, 40)]
            ],
        ),
        AIMessage("Anotado!"),
    ]
    reply = iron_agent.respond(user.id, "supino reto\n1 serie 10x20kg\n2 serie 10x30kg\n3 serie 10x40kg")
    assert reply.text == "Anotado!"
    assert sorted((s.set_number, float(s.weight_kg)) for s in set_rows(db)) == [(1, 20.0), (2, 30.0), (3, 40.0)]


def test_missing_data_asks_and_then_logs_with_answer(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set", "log_set"]
    script.responses = [
        AIMessage("Quantas repetições você fez?"),
        call("log_set", {"exercise": "supino reto", "reps": 8, "kg": 20, "set_number": 1}),
        AIMessage("Supino reto, série 1: 8 reps com 20kg. Anotado!"),
    ]
    first = iron_agent.respond(user.id, "supino reto 1 serie 20kg")
    assert "repetições" in first.text and set_rows(db) == []
    second = iron_agent.respond(user.id, "8")
    assert "Anotado" in second.text and [(s.set_number, s.reps) for s in set_rows(db)] == [(1, 8)]


def test_report_flow_uses_get_report(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["log_set", "report"]
    script.responses = [
        call("log_set", {"exercise": "supino reto", "reps": 10, "kg": 20}),
        AIMessage("Anotado!"),
        call("get_report", {"scope": "exercise", "target": "supino reto", "period": "90d"}),
        AIMessage("📈 Supino reto — 90 dias"),
    ]
    iron_agent.respond(user.id, "supino reto 10x20kg")
    reply = iron_agent.respond(user.id, "me dá um relatório da minha evolução no supino reto")
    assert reply.text.startswith("📈 Supino reto")


def test_finish_node_replies_without_llm(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["finish"]
    assert "nenhuma série" in iron_agent.respond(user.id, "terminei").text
    script.intents = ["log_set", "finish", "finish"]
    script.responses = [call("log_set", {"exercise": "supino reto", "reps": 10, "kg": 20}), AIMessage("Anotado!")]
    iron_agent.respond(user.id, "supino reto 10x20kg")
    assert "Treino concluído" in iron_agent.respond(user.id, "terminei").text
    assert "já foi fechado" in iron_agent.respond(user.id, "terminei de novo").text
