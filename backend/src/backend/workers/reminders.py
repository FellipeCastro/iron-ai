import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.domain.sessions import local_session_date
from backend.models.db import ChannelLink, ReminderLog, SetLog, User, WorkoutSession
from backend.services import workouts
from backend.utils.database import SessionLocal
from backend.utils.messaging import MessagingGateway
from backend.utils.telegram import get_gateway

log = logging.getLogger("iron.reminders")


def format_reminder(summary: dict) -> str:
    lines = [f"Hora do treino! Hoje é o Treino {summary['letter']} - {summary['name']}.", ""]
    for exercise in summary["exercises"]:
        lines.append(exercise["name"])
        for s in exercise["sets"]:
            goal = f"{s['reps']} x {s['kg']:g}kg" if s["reps"] is not None else "sem meta ainda"
            lines.append(f"  {s['set']}ª série: {goal}")
    lines += ["", "Me mande cada série quando fizer, por exemplo: \"supino reto 10 reps 20kg\"."]
    return "\n".join(lines)


def _is_training_day(session, user: User, today) -> bool:
    routine = workouts.active_routine(session, user.id)
    if routine is None:
        return False
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
                summary = workouts.next_workout_summary(session, user)
            if summary["status"] != "ok":
                continue
            gateway.send_text(chat_id, format_reminder(summary))
            sent += 1
        except Exception as exc:
            log.exception("falha no lembrete do usuário %s", user.id)
            sentry_sdk.capture_exception(exc)
    return sent


def start() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(send_due_reminders, "interval", minutes=1, max_instances=1, coalesce=True)
    scheduler.start()
    return scheduler
