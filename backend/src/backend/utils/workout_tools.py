"""Tools tipadas do agente. Sem SQL nem código gerado: cada tool chama um service."""

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

from backend.config import settings
from backend.models.db import Feedback, User
from backend.models.schema import AgentContext
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
    name: str = Field(description="Nome do exercício")
    sets: int = Field(ge=1, le=10, description="Número de séries. Nunca chute: se o usuário não disse, pergunte")


class WorkoutIn(BaseModel):
    name: str = Field(description="Nome do treino, ex.: Peito e tríceps")
    weekday: int | None = Field(default=None, ge=0, le=6, description="Dia da semana: 0=segunda ... 6=domingo")
    exercises: list[ExerciseIn]


class SaveRoutineInput(BaseModel):
    workouts: list[WorkoutIn] = Field(description="Treinos na ordem da rotação (A, B, C...)")


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

    @tool(args_schema=SaveRoutineInput)
    def save_routine(workouts: list[WorkoutIn]) -> dict:
        """Salva a rotina do usuário (substitui a atual). Só chame com nome e séries de todos os exercícios."""
        raw = [w.model_dump() for w in workouts]
        with SessionLocal.begin() as session:
            specs, ambiguous = wk.build_specs(session, ctx.user_id, raw)
            if ambiguous:
                return {"status": "ambiguous", "items": ambiguous}
            try:
                wk.save_routine(session, ctx.user_id, specs)
            except wk.ServiceError as exc:
                return {"status": "error", "message": str(exc)}
            summary = wk.describe_routine(specs)
        ctx.mutated = True
        return {"status": "saved", "summary": summary, "review_url": f"{settings.site_url.rstrip('/')}/app/treinos"}

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
        "save_routine": save_routine,
        "send_feedback": send_feedback,
    }
