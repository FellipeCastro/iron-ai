"""Tools tipadas do agente. Sem SQL nem código gerado: cada tool chama um service."""

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

from backend.models.db import Feedback, User
from backend.models.schema import AgentContext
from backend.services import confirmations
from backend.services import workouts as wk
from backend.utils.database import SessionLocal


class LogSetInput(BaseModel):
    exercise: str = Field(description="Nome do exercício como o usuário disse")
    reps: int = Field(description="Repetições feitas")
    kg: float = Field(description="Carga em kg (0 para peso do corpo)")
    set_number: int | None = Field(default=None, description="Número da série, só se o usuário disse explicitamente")


class CorrectSetInput(BaseModel):
    reps: int | None = Field(default=None, description="Novas repetições, se mudaram")
    kg: float | None = Field(default=None, description="Nova carga em kg, se mudou")
    exercise: str | None = Field(default=None, description="Novo exercício, se o usuário trocou")


class ProgressInput(BaseModel):
    exercise: str = Field(description="Nome do exercício")


class ExerciseIn(BaseModel):
    name: str
    sets: int = Field(default=3, ge=1, le=10)


class WorkoutIn(BaseModel):
    name: str = Field(description="Nome do treino, ex.: Peito e tríceps")
    weekday: int | None = Field(default=None, ge=0, le=6, description="Dia da semana: 0=segunda ... 6=domingo")
    exercises: list[ExerciseIn]


class ProposeRoutineInput(BaseModel):
    workouts: list[WorkoutIn] = Field(description="Treinos na ordem da rotação (A, B, C...)")


class ConfirmInput(BaseModel):
    accept: bool = Field(description="true para salvar a rotina proposta, false para descartar")


class FeedbackInput(BaseModel):
    text: str


def _user(session, ctx: AgentContext) -> User:
    return session.get(User, ctx.user_id)


def make_tools(ctx: AgentContext) -> dict[str, BaseTool]:
    @tool(args_schema=LogSetInput)
    def log_set(exercise: str, reps: int, kg: float, set_number: int | None = None) -> dict:
        """Registra uma série feita e devolve a meta atualizada pela progressão."""
        try:
            with SessionLocal.begin() as session:
                result = wk.log_set(session, _user(session, ctx), exercise, reps, kg, set_number)
        except wk.ServiceError as exc:
            return {"status": "error", "message": str(exc)}
        ctx.mutated = ctx.mutated or result["status"] == "ok"
        return result

    @tool(args_schema=CorrectSetInput)
    def correct_last_set(reps: int | None = None, kg: float | None = None, exercise: str | None = None) -> dict:
        """Corrige a última série registrada (repetições, carga ou exercício)."""
        try:
            with SessionLocal.begin() as session:
                result = wk.correct_last_set(session, _user(session, ctx), reps, kg, exercise)
        except wk.ServiceError as exc:
            return {"status": "error", "message": str(exc)}
        ctx.mutated = ctx.mutated or result["status"] == "ok"
        return result

    @tool
    def get_next_workout() -> dict:
        """Devolve o próximo treino da rotação com a meta de cada exercício e série."""
        with SessionLocal() as session:
            return wk.next_workout_summary(session, _user(session, ctx))

    @tool(args_schema=ProgressInput)
    def get_progress(exercise: str) -> dict:
        """Histórico recente de um exercício (cargas, 1RM estimado, volume) e metas atuais."""
        with SessionLocal() as session:
            return wk.progress_summary(session, _user(session, ctx), exercise)

    @tool(args_schema=ProposeRoutineInput, return_direct=True)
    def propose_routine(workouts: list[WorkoutIn]) -> str:
        """Propõe uma rotina ao usuário. Nada é salvo até ele confirmar pelos botões."""
        raw = [w.model_dump() for w in workouts]
        with SessionLocal.begin() as session:
            specs, ambiguous = wk.build_specs(session, ctx.user_id, raw)
            if ambiguous:
                lines = [f"- \"{a['typed']}\": {', '.join(a['options']) or 'não encontrei opções'}" for a in ambiguous]
                return "Antes de montar a rotina, preciso saber qual exercício você quer:\n" + "\n".join(lines)
            if not specs or any(not w.exercises for w in specs):
                return "Preciso de pelo menos um exercício em cada treino. Me conte o que você faz em cada dia."
            pending = confirmations.create_pending(session, ctx.user_id, "routine", wk.routine_specs_to_payload(specs))
            summary = wk.describe_routine(specs)
        ctx.buttons = [("Confirmar", f"confirm:{pending.id}"), ("Cancelar", f"cancel:{pending.id}")]
        return f"Essa é a rotina que montei:\n\n{summary}\n\nQuer salvar assim?"

    @tool(args_schema=ConfirmInput)
    def confirm_routine(accept: bool) -> dict:
        """Salva (accept=true) ou descarta (accept=false) a rotina que está aguardando confirmação."""
        with SessionLocal.begin() as session:
            result = confirmations.resolve_pending(session, _user(session, ctx), accept)
        ctx.mutated = ctx.mutated or result["status"] == "saved"
        return result

    @tool(args_schema=FeedbackInput)
    def send_feedback(text: str) -> dict:
        """Guarda um feedback do usuário sobre o Iron."""
        with SessionLocal.begin() as session:
            session.add(Feedback(user_id=ctx.user_id, text=text[:2000]))
        return {"status": "ok"}

    return {
        "log_set": log_set,
        "correct_last_set": correct_last_set,
        "get_next_workout": get_next_workout,
        "get_progress": get_progress,
        "propose_routine": propose_routine,
        "confirm_routine": confirm_routine,
        "send_feedback": send_feedback,
    }
