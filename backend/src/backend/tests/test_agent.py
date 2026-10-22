from typing import Any

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import RunnableLambda

from backend.agents import iron_agent
from backend.models.db import SetLog
from backend.services import conversation, workouts
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


def test_routine_proposal_needs_confirmation_buttons(db, make_user, script):
    user = make_user()
    db.commit()
    script.intents = ["routine"]
    script.responses = [
        call(
            "propose_routine",
            {"workouts": [{"name": "Peito", "weekday": 0, "exercises": [{"name": "supino reto", "sets": 4}]}]},
        )
    ]
    reply = iron_agent.respond(user.id, "monta um treino de peito na segunda")
    assert "Essa é a rotina" in reply.text and "Supino reto: 4 séries" in reply.text
    labels = [b[0] for b in reply.buttons]
    assert labels == ["Confirmar", "Cancelar"]
    assert workouts.active_routine(db, user.id) is None

    class Gateway:
        sent = []

        def answer_callback(self, _id): ...

        def send_text(self, chat_id, text):
            self.sent.append(text)

    from backend.services import linking
    from backend.utils.messaging import IncomingMessage

    code, _ = linking.create_link_code(db, user)
    db.commit()
    linking.consume_link_code(db, code, "555")
    db.commit()
    gw = Gateway()
    conversation.handle_message(gw, IncomingMessage(1, "telegram", "555", callback_data=reply.buttons[0][1], callback_id="cb"))
    db.expire_all()
    assert workouts.active_routine(db, user.id).workouts[0].exercises[0].sets_count == 4
    assert "Rotina salva" in gw.sent[0]


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
