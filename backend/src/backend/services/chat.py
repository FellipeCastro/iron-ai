from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.config import settings
from backend.domain.sessions import local_session_date
from backend.models.db import ChatMessage, DailyUsage, User

HISTORY_WINDOW = timedelta(hours=6)
HISTORY_LIMIT = 10
KEEP_MESSAGES = 40


def add_message(session: Session, user_id: int, role: str, content: str) -> None:
    session.add(ChatMessage(user_id=user_id, role=role, content=content[:4000]))
    session.flush()
    keep = select(ChatMessage.id).where(ChatMessage.user_id == user_id).order_by(ChatMessage.id.desc()).limit(KEEP_MESSAGES)
    session.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id, ChatMessage.id.not_in(keep)))


def recent_messages(session: Session, user_id: int, now: datetime | None = None) -> list[tuple[str, str]]:
    now = now or datetime.now(UTC)
    rows = session.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.created_at > now - HISTORY_WINDOW)
        .order_by(ChatMessage.id.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    return [(m.role, m.content) for m in reversed(rows)]


def count_message(session: Session, user: User, now: datetime | None = None) -> tuple[int, date]:
    """Soma 1 ao uso do dia local do usuário e devolve o total já incluindo esta mensagem."""
    day = local_session_date(now or datetime.now(UTC), user.timezone)
    stmt = insert(DailyUsage).values(user_id=user.id, local_date=day, message_count=1)
    stmt = stmt.on_conflict_do_update(
        index_elements=[DailyUsage.user_id, DailyUsage.local_date],
        set_={"message_count": DailyUsage.message_count + 1},
    ).returning(DailyUsage.message_count)
    return session.execute(stmt).scalar_one(), day


def over_limit(count: int) -> bool:
    return count > settings.daily_message_limit
