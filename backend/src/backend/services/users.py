from datetime import time
from decimal import Decimal
from zoneinfo import available_timezones

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.db import ChannelLink, Exercise, User


def get_or_create_user(session: Session, clerk_id: str) -> User:
    session.execute(insert(User).values(clerk_id=clerk_id).on_conflict_do_nothing(index_elements=[User.clerk_id]))
    return session.scalars(select(User).where(User.clerk_id == clerk_id)).one()


def get_link(session: Session, user_id: int) -> ChannelLink | None:
    return session.scalars(select(ChannelLink).where(ChannelLink.user_id == user_id)).first()


def user_by_channel(session: Session, channel: str, external_id: str) -> User | None:
    return session.scalars(
        select(User)
        .join(ChannelLink, ChannelLink.user_id == User.id)
        .where(ChannelLink.channel == channel, ChannelLink.external_id == external_id)
    ).first()


def update_settings(
    session: Session,
    user: User,
    reminder_time: time | None,
    weight_increment_kg: Decimal,
    timezone: str,
) -> User:
    if timezone not in available_timezones():
        raise ValueError("fuso horário inválido")
    if not Decimal("0.5") <= weight_increment_kg <= Decimal("20"):
        raise ValueError("incremento deve ficar entre 0,5 e 20 kg")
    user.reminder_time = reminder_time
    user.weight_increment_kg = weight_increment_kg
    user.timezone = timezone
    session.flush()
    return user


def delete_account(session: Session, user: User) -> None:
    """Apaga o usuário e, por cascata, vínculo, rotina, sessões, séries, metas e inbox (LGPD)."""
    session.execute(delete(User).where(User.id == user.id))


def delete_clerk_user(clerk_id: str) -> bool:
    """Remove a conta no Clerk. Sem CLERK_SECRET_KEY configurada, apenas ignora."""
    if not settings.clerk_secret_key:
        return False
    response = httpx.delete(
        f"https://api.clerk.com/v1/users/{clerk_id}",
        headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
        timeout=10,
    )
    return response.status_code in (200, 404)


def exercise_by_id(session: Session, exercise_id: int) -> Exercise | None:
    return session.get(Exercise, exercise_id)
