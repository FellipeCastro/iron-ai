import logging
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from backend.domain.sessions import local_session_date
from backend.models.db import ChannelLink, ReminderLog, SetLog, User, WorkoutSession
from backend.services import reports, workouts
from backend.utils.database import SessionLocal
from backend.utils.messaging import MessagingGateway
from backend.utils.telegram import get_gateway

log = logging.getLogger("iron.reminders")


MAX_EXERCISES = 10
LONG_BREAK_DAYS = 7


def _goals_line(sets: list[dict]) -> str:
    """Metas das séries; séries consecutivas iguais viram '2x 10x22kg'."""
    if all(s["reps"] is None for s in sets):
        return "Primeira vez nesse exercício — sem meta, registra o que conseguir!"
    groups: list[list] = []
    for s in sets:
        goal = f"{s['reps']}x{s['kg']:g}kg" if s["reps"] is not None else "sem meta"
        if groups and groups[-1][0] == goal:
            groups[-1][1] += 1
        else:
            groups.append([goal, 1])
    return "Metas: " + " · ".join(f"{n}x {goal}" if n > 1 else goal for goal, n in groups)


def format_reminder(summary: dict, name: str | None = None) -> str:
    who = f", {name.split()[0]}" if name else ""
    days = summary.get("days_since_training")
    opening = (
        f"Faz {days} dias que você não treina{who}… bora retomar? 💪"
        if days is not None and days >= LONG_BREAK_DAYS
        else f"Bora treinar{who}! 💪"
    )
    lines = [opening, f"Hoje: Treino {summary['letter']} — {summary['name']}", ""]
    exercises = summary["exercises"]
    for index, exercise in enumerate(exercises[:MAX_EXERCISES], start=1):
        lines.append(f"{index}. {exercise['name']} — {len(exercise['sets'])} séries")
        lines.append(f"   {_goals_line(exercise['sets'])}")
    if len(exercises) > MAX_EXERCISES:
        lines.append(f"...e mais {len(exercises) - MAX_EXERCISES} exercícios.")
    last = summary.get("last_session")
    if last:
        day = date.fromisoformat(last["date"])
        lines += ["", f"Última vez: {day.day:02d}/{day.month:02d} · {last['sets']} séries, {last['volume']:g}kg"]
    lines += ["", "Manda as séries aqui que eu anoto, ex.: \"supino reto 10x22kg\"."]
    return "\n".join(lines)


def _is_training_day(session, user: User, today) -> bool:
    routine = workouts.active_routine(session, user.id)
    if routine is None:
        return False
    if user.training_days:  # dias informados pelo usuário; senão, o dia sugerido em cada treino
        return today.weekday() in user.training_days
    return today.weekday() in {w.weekday_hint for w in routine.workouts if w.weekday_hint is not None}


def send_due_reminders(gateway: MessagingGateway | None = None, now: datetime | None = None) -> int:
    """Envia o lembrete a quem está no horário, em dia de treino e sem série registrada hoje.

    A linha em reminder_log (chave usuário+dia) é gravada antes do envio: reiniciar o processo
    no mesmo minuto não duplica.
    """
    gateway = gateway or get_gateway()
    now = now or datetime.now(UTC)
    sent = 0
    with SessionLocal() as session:
        candidates = session.execute(
            select(User, ChannelLink.external_id)
            .join(ChannelLink, ChannelLink.user_id == User.id)
            .where(User.reminder_time.is_not(None), ChannelLink.channel == "telegram")
        ).all()
    for user, chat_id in candidates:
        local_now = now.astimezone(ZoneInfo(user.timezone))
        if (local_now.hour, local_now.minute) < (user.reminder_time.hour, user.reminder_time.minute):
            continue
        today = local_session_date(now, user.timezone)
        if local_now.date() != today:  # entre 00:00 e 04:00 ainda vale o dia anterior; não lembra
            continue
        try:
            with SessionLocal.begin() as session:
                if not _is_training_day(session, user, today):
                    continue
                trained = session.scalars(
                    select(SetLog.id)
                    .join(WorkoutSession, WorkoutSession.id == SetLog.session_id)
                    .where(WorkoutSession.user_id == user.id, WorkoutSession.local_date == today)
                    .limit(1)
                ).first()
                if trained:
                    continue
                claimed = session.execute(
                    insert(ReminderLog)
                    .values(user_id=user.id, local_date=today)
                    .on_conflict_do_nothing()
                    .returning(ReminderLog.user_id)
                ).scalar_one_or_none()
                if claimed is None:
                    continue
                summary = workouts.next_workout_summary(session, user, now)
            if summary["status"] != "ok":
                continue
            gateway.send_text(chat_id, format_reminder(summary, user.name))
            sent += 1
        except Exception as exc:
            log.exception("falha no lembrete do usuário %s", user.id)
            sentry_sdk.capture_exception(exc)
    return sent


def send_idle_summaries(gateway: MessagingGateway | None = None, now: datetime | None = None) -> int:
    """Resumo pós-treino das sessões paradas há reports.IDLE_MINUTES que o usuário não fechou sozinho.

    summary_sent_at é reivindicado (UPDATE ... WHERE NULL) antes do envio, como o reminder_log.
    """
    gateway = gateway or get_gateway()
    now = now or datetime.now(UTC)
    with SessionLocal() as session:
        idle = reports.idle_sessions_without_summary(session, now)
    sent = 0
    for user_id, session_id in idle:
        try:
            with SessionLocal.begin() as session:
                claimed = session.execute(
                    update(WorkoutSession)
                    .where(WorkoutSession.id == session_id, WorkoutSession.summary_sent_at.is_(None))
                    .values(summary_sent_at=now)
                    .returning(WorkoutSession.id)
                ).scalar_one_or_none()
                if claimed is None:
                    continue
                user = session.get(User, user_id)
                summary = reports.session_summary(session, user, session_id)
                chat_id = session.scalars(
                    select(ChannelLink.external_id).where(ChannelLink.user_id == user_id, ChannelLink.channel == "telegram")
                ).first()
            if summary["status"] != "ok" or chat_id is None:
                continue
            gateway.send_text(chat_id, reports.format_session_summary(summary))
            sent += 1
        except Exception as exc:
            log.exception("falha no resumo da sessão %s", session_id)
            sentry_sdk.capture_exception(exc)
    return sent


def start() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(send_due_reminders, "interval", minutes=1, max_instances=1, coalesce=True)
    scheduler.add_job(send_idle_summaries, "interval", minutes=5, max_instances=1, coalesce=True)
    scheduler.start()
    return scheduler
