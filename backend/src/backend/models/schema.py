from dataclasses import dataclass, field
from operator import add
from typing import Annotated, Literal

from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field

Intent = Literal["log_set", "correct_set", "routine", "progress", "feedback", "general"]


class RouterSchema(BaseModel):
    """Classificação da intenção da mensagem do usuário."""

    intent: Intent = Field(
        description=(
            "log_set: registrar série feita (exercício, reps, carga). "
            "correct_set: corrigir a última série registrada. "
            "routine: criar, importar, ver ou alterar rotina; confirmar ou cancelar uma proposta de rotina; "
            "perguntar qual é o próximo treino. "
            "progress: consultar evolução, cargas, recordes ou histórico de um exercício. "
            "feedback: sugestão, elogio ou reclamação sobre o Iron. "
            "general: cumprimento ou conversa que não se encaixa nas demais."
        )
    )


@dataclass
class AgentContext:
    """Estado de uma execução do agente. O LLM nunca vê o user_id: as tools o recebem daqui."""

    user_id: int
    buttons: list[tuple[str, str]] = field(default_factory=list)
    mutated: bool = False  # alguma tool já gravou algo; repetir a execução duplicaria dados


@dataclass
class AgentReply:
    text: str
    buttons: list[tuple[str, str]] = field(default_factory=list)


class IronState(BaseModel):
    messages: Annotated[list[BaseMessage], add] = Field(default_factory=list)
    intent: Intent | None = None
    reply: str = ""
