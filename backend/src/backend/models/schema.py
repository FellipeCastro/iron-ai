from dataclasses import dataclass, field
from operator import add
from typing import Annotated, Literal

from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field

Intent = Literal["log_set", "correct_set", "finish", "routine", "progress", "report", "feedback", "general"]


class RouterSchema(BaseModel):
    """Classificação da intenção da mensagem do usuário."""

    intent: Intent = Field(
        description=(
            "log_set: registrar série(s) feita(s) (exercício, reps, carga), uma por mensagem ou várias juntas, "
            "ex.: 'supino reto 1 serie 10x20kg' ou um exercício seguido de uma série por linha. "
            "correct_set: corrigir a última série registrada. "
            "routine: cadastrar, ver ou alterar o treino/rotina (inclui responder à pergunta sobre o treino atual); "
            "perguntar qual é o próximo treino. "
            "finish: avisar que terminou o treino de hoje ('terminei', 'acabei o treino', 'fechei'). "
            "progress: pergunta rápida sobre cargas, recordes ou histórico recente de um exercício. "
            "report: pedir um relatório ou balanço de evolução de um exercício ou grupo muscular, "
            "ex.: 'me dá um relatório da minha evolução no supino', 'relatório dos meus treinos de peito'. "
            "feedback: sugestão, elogio ou reclamação sobre o Iron. "
            "general: cumprimento ou conversa que não se encaixa nas demais."
        )
    )


@dataclass
class AgentContext:
    """Estado de uma execução do agente. O LLM nunca vê o user_id: as tools o recebem daqui."""

    user_id: int
    buttons: list[tuple[str, str]] = field(default_factory=list)
    workout_done: bool = False  # a última série registrada fechou todos os exercícios do treino
    mutated: bool = False  # alguma tool já gravou algo; repetir a execução duplicaria dados


@dataclass
class AgentReply:
    text: str
    buttons: list[tuple[str, str]] = field(default_factory=list)


class IronState(BaseModel):
    messages: Annotated[list[BaseMessage], add] = Field(default_factory=list)
    intent: Intent | None = None
    reply: str = ""
