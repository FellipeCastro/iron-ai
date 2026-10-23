"""Tools tipadas do agente. Sem SQL nem código gerado: cada tool chama um service."""

import threading
from datetime import time
from typing import Literal

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

from backend.config import settings
from backend.models.db import Feedback, User
from backend.models.schema import AgentContext
from backend.services import reports, users
from backend.services import workouts as wk
from backend.utils.database import SessionLocal


class LogSetInput(BaseModel):
    exercise: str = Field(description="Nome do exercício como o usuário disse")
    reps: int = Field(description="Repetições feitas")
    kg: float = Field(description="Carga em kg (0 para peso do corpo)")
    set_number: int | None = Field(default=None, description="Número da série, só se o usuário disse explicitamente")


class SetValuesInput(BaseModel):
    reps: int = Field(description="Repetições feitas")
    kg: float = Field(description="Carga em kg (0 para peso do corpo)")


class LogSetsInput(BaseModel):
    sets: list[LogSetInput] = Field(description="Todas as séries da mensagem, na ordem em que o usuário escreveu")


class CorrectSetsInput(BaseModel):
    exercise: str = Field(description="Exercício cujas séries de hoje serão corrigidas")
    sets: list[SetValuesInput] = Field(description="Séries corretas, na ordem: a 1ª substitui a série 1, a 2ª a série 2...")


class CorrectSetInput(BaseModel):
    reps: int | None = Field(default=None, description="Novas repetições, se mudaram")
    kg: float | None = Field(default=None, description="Nova carga em kg, se mudou")
    exercise: str | None = Field(default=None, description="Novo exercício, se o usuário trocou")


class ProgressInput(BaseModel):
    exercise: str = Field(description="Nome do exercício")


class ReportInput(BaseModel):
    scope: Literal["exercise", "muscle_group"] = Field(description="exercise: um exercício; muscle_group: um grupo muscular")
    target: str = Field(description="Nome do exercício ou do grupo muscular (ex.: peito, costas, pernas)")
    period: Literal["30d", "90d", "all"] = Field(default="90d", description="Período analisado")


class ExerciseIn(BaseModel):
    name: str = Field(description="Nome do exercício")
    sets: int = Field(ge=1, le=10, description="Número de séries. Nunca chute: se o usuário não disse, pergunte")


class WorkoutIn(BaseModel):
    name: str = Field(description="Nome do treino, ex.: Peito e tríceps")
    weekday: int | None = Field(default=None, ge=0, le=6, description="Dia da semana: 0=segunda ... 6=domingo")
    exercises: list[ExerciseIn]


class SaveRoutineInput(BaseModel):
    workouts: list[WorkoutIn] = Field(description="Treinos na ordem da rotação (A, B, C...)")
    training_days: list[int] = Field(
        min_length=1, max_length=7, description="Dias da semana em que o usuário treina: 0=segunda ... 6=domingo"
    )
    reminder_time: str = Field(pattern=r"^([01]?\d|2[0-3]):[0-5]\d$", description="Horário do treino (o aviso é enviado nele), HH:MM (24h)")


class FeedbackInput(BaseModel):
    text: str


_log_lock = threading.Lock()  # o LLM pode chamar tools em paralelo; a numeração das séries precisa ser serial


def _user(session, ctx: AgentContext) -> User:
    return session.get(User, ctx.user_id)


def make_tools(ctx: AgentContext) -> dict[str, BaseTool]:
    def _log_many(items: list[LogSetInput]) -> list[dict]:
        results = []
        with _log_lock:
            for item in items:
                try:
                    with SessionLocal.begin() as session:
                        result = wk.log_set(session, _user(session, ctx), item.exercise, item.reps, item.kg, item.set_number)
                except wk.ServiceError as exc:
                    results.append({"status": "error", "message": str(exc), "exercise": item.exercise})
                    continue
                if result["status"] == "ok":
                    ctx.mutated = True
                    ctx.workout_done = ctx.workout_done or result["workout_done"]
                results.append(result)
        return results

    @tool(args_schema=LogSetInput)
    def log_set(exercise: str, reps: int, kg: float, set_number: int | None = None) -> dict:
        """Registra uma série feita e devolve a meta atualizada pela progressão."""
        return _log_many([LogSetInput(exercise=exercise, reps=reps, kg=kg, set_number=set_number)])[0]

    @tool(args_schema=LogSetsInput)
    def log_sets(sets: list[LogSetInput]) -> list[dict]:
        """Registra várias séries de uma vez, em ordem. Use sempre que a mensagem tiver mais de uma série."""
        return _log_many(sets)

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

    @tool(args_schema=CorrectSetsInput)
    def correct_sets(exercise: str, sets: list[SetValuesInput]) -> list[dict]:
        """Corrige várias séries de hoje de um exercício de uma vez (série 1, 2, 3...), substituindo as registradas.
        Use quando o usuário reenviar os valores certos de um exercício ("mandei errado, foi assim")."""
        return _log_many(
            [LogSetInput(exercise=exercise, reps=item.reps, kg=item.kg, set_number=number) for number, item in enumerate(sets, 1)]
        )

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

    @tool(args_schema=ReportInput)
    def get_report(scope: str, target: str, period: str = "90d") -> dict:
        """Relatório de evolução de um exercício ou de um grupo muscular no período."""
        with SessionLocal() as session:
            user = _user(session, ctx)
            if scope == "exercise":
                return reports.exercise_report(session, user, target, period)
            return reports.muscle_group_report(session, user, target, period)

    @tool(args_schema=SaveRoutineInput)
    def save_routine(workouts: list[WorkoutIn], training_days: list[int], reminder_time: str) -> dict:
        """Salva a rotina, os dias de treino e o horário do treino (substitui a rotina atual).
        Só chame com nome e séries de todos os exercícios, os dias e o horário que o usuário informou."""
        raw = [w.model_dump() for w in workouts]
        with SessionLocal.begin() as session:
            specs, ambiguous = wk.build_specs(session, ctx.user_id, raw)
            if ambiguous:
                return {"status": "ambiguous", "items": ambiguous}
            try:
                wk.save_routine(session, ctx.user_id, specs)
            except wk.ServiceError as exc:
                return {"status": "error", "message": str(exc)}
            hour, minute = reminder_time.split(":")
            users.set_schedule(session, _user(session, ctx), time(int(hour), int(minute)), training_days)
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
        "log_sets": log_sets,
        "correct_last_set": correct_last_set,
        "correct_sets": correct_sets,
        "get_next_workout": get_next_workout,
        "get_progress": get_progress,
        "get_report": get_report,
        "save_routine": save_routine,
        "send_feedback": send_feedback,
    }
