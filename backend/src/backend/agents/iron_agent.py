"""Agente principal: um router_node classifica a intenção e despacha para o subagente certo."""

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from backend.agents import subagents
from backend.models.schema import AgentContext, AgentReply, IronState, RouterSchema
from backend.services import chat
from backend.utils import llm_pick
from backend.utils.database import SessionLocal
from backend.utils.workout_tools import make_tools

ROUTER_PROMPT = (
    "Classifique a última mensagem do usuário de um app de treino de academia. "
    "Use o histórico para entender respostas curtas (ex.: 'reto' respondendo a uma pergunta sobre o exercício, "
    "'sim'). Se o assistente acabou de pedir o treino do usuário, a resposta é routine. "
    "Se o assistente acabou de perguntar um dado de uma série (repetições, série, exercício ou kg), "
    "a resposta é log_set."
)

GENERAL_PROMPT = (
    subagents.STYLE
    + "\n\nVocê conversa de forma geral. Explique o que o Iron faz quando perguntarem: registra séries pelo "
    "Telegram, sugere a meta da próxima sessão (sobe 1 rep até 12, depois volta para 8 reps com mais carga), "
    "guarda a rotina e mostra a evolução. Responda em poucas palavras. Não tem acesso a dados nesta resposta; se o usuário pedir dados, "
    "peça que reformule o pedido."
)

NODES = {
    "log_set": "logger",
    "correct_set": "logger",
    "routine": "routine",
    "progress": "progress",
    "feedback": "feedback",
    "general": "general",
}


def _ctx(config: RunnableConfig) -> AgentContext:
    return config["configurable"]["ctx"]


def router_node(state: IronState) -> dict:
    router = llm_pick.pick_llm("low").with_structured_output(RouterSchema)
    decision = router.invoke([SystemMessage(ROUTER_PROMPT), *state.messages[-7:]])
    return {"intent": decision.intent}


def route_decision(state: IronState) -> str:
    return NODES[state.intent or "general"]


def logger_node(state: IronState, config: RunnableConfig) -> dict:
    return {"reply": subagents.workout_logger(_ctx(config), state.messages)}


def routine_node(state: IronState, config: RunnableConfig) -> dict:
    return {"reply": subagents.routine_builder(_ctx(config), state.messages)}


def progress_node(state: IronState, config: RunnableConfig) -> dict:
    return {"reply": subagents.progress_analyst(_ctx(config), state.messages)}


def feedback_node(state: IronState, config: RunnableConfig) -> dict:
    text = str(state.messages[-1].content)
    make_tools(_ctx(config))["send_feedback"].invoke({"text": text})
    return {"reply": "Valeu pelo feedback! Já anotei e vou levar para o time."}


def general_node(state: IronState) -> dict:
    answer = llm_pick.pick_llm("low").invoke([SystemMessage(GENERAL_PROMPT), *state.messages[-7:]])
    return {"reply": str(answer.content)}


def build_graph():
    graph = StateGraph(IronState)
    graph.add_node("router_node", router_node)
    graph.add_node("logger", logger_node)
    graph.add_node("routine", routine_node)
    graph.add_node("progress", progress_node)
    graph.add_node("feedback", feedback_node)
    graph.add_node("general", general_node)
    graph.add_edge(START, "router_node")
    graph.add_conditional_edges("router_node", route_decision, {name: name for name in set(NODES.values())})
    for name in set(NODES.values()):
        graph.add_edge(name, END)
    return graph.compile()


_graph = None


def _history(user_id: int, text: str) -> list[BaseMessage]:
    with SessionLocal() as session:
        past = chat.recent_messages(session, user_id)
    messages: list[BaseMessage] = [HumanMessage(c) if role == "user" else AIMessage(c) for role, c in past]
    return [*messages, HumanMessage(text)]


FALLBACK_AFTER_WRITE = "Anotei! Só não consegui montar a resposta completa agora. Confira o registro no site."


def respond(user_id: int, text: str) -> AgentReply:
    global _graph
    _graph = _graph or build_graph()
    ctx = AgentContext(user_id=user_id)
    try:
        state = _graph.invoke({"messages": _history(user_id, text)}, {"configurable": {"ctx": ctx}})
    except Exception:
        if ctx.mutated:  # tentar de novo duplicaria o que já foi gravado
            return AgentReply(FALLBACK_AFTER_WRITE)
        raise
    reply = (state["reply"] if isinstance(state, dict) else state.reply).strip()
    return AgentReply(reply or "Não entendi, pode repetir?", ctx.buttons)


def main() -> None:
    """REPL de desenvolvimento: uv run python -m backend.agents.iron_agent <user_id>."""
    import sys

    user_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    with open("iron_graph.md", "w", encoding="utf-8") as f:
        f.write("```mermaid\n" + build_graph().get_graph().draw_mermaid() + "\n```\n")
    print("Diagrama em iron_graph.md. Ctrl+C para sair.")
    while True:
        text = input("você> ").strip()
        if not text:
            continue
        reply = respond(user_id, text)
        with SessionLocal.begin() as session:
            chat.add_message(session, user_id, "user", text)
            chat.add_message(session, user_id, "assistant", reply.text)
        print(f"iron> {reply.text}" + (f"  {reply.buttons}" if reply.buttons else ""))


if __name__ == "__main__":
    main()
