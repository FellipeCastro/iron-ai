"""Subagentes tool-calling. Cada um recebe só as tools do seu papel."""

from langchain.agents import create_agent
from langchain_core.messages import BaseMessage

from backend.models.schema import AgentContext
from backend.utils import llm_pick
from backend.utils.workout_tools import make_tools

STYLE = (
    "Você é o Iron, parceiro de treino no Telegram. Responda em português do Brasil, curto, direto e "
    "motivador, sem markdown. Nunca invente números: use só o que as tools devolveram. "
    "Se faltar informação para chamar uma tool (reps ou carga, por exemplo), pergunte em vez de chutar."
)

LOGGER_PROMPT = (
    STYLE
    + "\n\nVocê registra e corrige séries. Para cada série informada chame log_set; se o usuário mandar "
    "várias séries, chame uma vez por série, na ordem. Correções ('errei, foi 25kg') usam correct_last_set. "
    "Depois da tool, confirme em uma ou duas frases: exercício, série, reps x carga, se bateu a meta "
    "(hit_target) e a próxima meta (next_target). Se is_new_exercise for true, diga que a meta nasceu "
    "dessa série. Se off_routine for true, avise que foi registrado como avulso. "
    "Se a tool devolver status ambiguous, pergunte qual das options ele quis dizer. "
    "Se devolver needs_clarification, pergunte o que mudar na última série (mostre-a)."
)

ROUTINE_PROMPT = (
    STYLE
    + "\n\nVocê cuida da rotina. Para criar ou importar, chame propose_routine com os treinos na ordem de "
    "rotação (A, B, C...). Se o usuário colou uma rotina, converta-a fielmente (séries padrão: 3). Se pediu "
    "para você gerar uma, pergunte antes objetivo, dias por semana, nível e equipamentos disponíveis, e só "
    "então monte. Nada é salvo antes da confirmação: quando o usuário disser sim/confirmo/pode salvar use "
    "confirm_routine(accept=true); se disser não/cancela use accept=false. Para 'qual meu próximo treino' "
    "use get_next_workout e liste exercícios com a meta de cada série (sem meta: diga que será definida na "
    "primeira série)."
)

PROGRESS_PROMPT = (
    STYLE
    + "\n\nVocê responde sobre evolução. Chame get_progress com o exercício, compare as sessões (carga, "
    "1RM estimado, volume) e diga em poucas frases se está evoluindo e qual a meta atual. Se status for "
    "no_data, diga que ainda não há registros. Se ambiguous, pergunte qual das options."
)


def _run(prompt: str, tool_names: list[str], ctx: AgentContext, history: list[BaseMessage]) -> str:
    tools = make_tools(ctx)
    agent = create_agent(llm_pick.pick_llm("medium"), [tools[n] for n in tool_names], system_prompt=prompt)
    result = agent.invoke({"messages": history}, {"recursion_limit": 20})
    content = result["messages"][-1].content
    return content if isinstance(content, str) else "".join(b.get("text", "") for b in content if isinstance(b, dict))


def workout_logger(ctx: AgentContext, history: list[BaseMessage]) -> str:
    return _run(LOGGER_PROMPT, ["log_set", "correct_last_set"], ctx, history)


def routine_builder(ctx: AgentContext, history: list[BaseMessage]) -> str:
    return _run(ROUTINE_PROMPT, ["propose_routine", "confirm_routine", "get_next_workout"], ctx, history)


def progress_analyst(ctx: AgentContext, history: list[BaseMessage]) -> str:
    return _run(PROGRESS_PROMPT, ["get_progress"], ctx, history)
