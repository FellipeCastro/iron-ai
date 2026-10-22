from datetime import UTC, datetime, timedelta

from sqlalchemy import text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.models.db import Inbox
from backend.utils.messaging import IncomingMessage

MAX_ATTEMPTS = 5
BACKOFF_SECONDS = 5

# Só a mensagem mais antiga ainda aberta de cada chat pode ser pega: mantém a ordem por usuário
# e impede dois workers de processarem o mesmo chat ao mesmo tempo.
_CLAIM_SQL = text(
    """
    SELECT i.id FROM inbox i
    WHERE i.status = 'pending'
      AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= :now)
      AND NOT EXISTS (
        SELECT 1 FROM inbox o
        WHERE o.channel = i.channel AND o.external_id = i.external_id
          AND o.status IN ('pending', 'processing') AND o.id < i.id
      )
    ORDER BY i.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
    """
)


def enqueue(session: Session, message: IncomingMessage, payload: dict) -> bool:
    """Grava o update no inbox. Devolve False quando o update_id já havia chegado."""
    stmt = (
        insert(Inbox)
        .values(update_id=message.update_id, channel=message.channel, external_id=message.external_id, payload=payload)
        .on_conflict_do_nothing(index_elements=[Inbox.channel, Inbox.update_id])
        .returning(Inbox.id)
    )
    return session.execute(stmt).scalar_one_or_none() is not None


def claim_next(session: Session, now: datetime | None = None) -> Inbox | None:
    now = now or datetime.now(UTC)
    inbox_id = session.execute(_CLAIM_SQL, {"now": now}).scalar_one_or_none()
    if inbox_id is None:
        return None
    row = session.get(Inbox, inbox_id)
    row.status = "processing"
    row.attempts += 1
    session.flush()
    return row


def mark_done(session: Session, inbox_id: int) -> None:
    session.execute(update(Inbox).where(Inbox.id == inbox_id).values(status="done", error=None))


def mark_failed(session: Session, inbox_id: int, error: str, now: datetime | None = None) -> str:
    """Agenda nova tentativa com backoff exponencial ou, esgotadas as tentativas, marca como failed."""
    now = now or datetime.now(UTC)
    row = session.get(Inbox, inbox_id)
    row.error = error[:1000]
    if row.attempts >= MAX_ATTEMPTS:
        row.status = "failed"
    else:
        row.status = "pending"
        row.next_attempt_at = now + timedelta(seconds=BACKOFF_SECONDS * 2 ** (row.attempts - 1))
    session.flush()
    return row.status


def reset_stuck(session: Session) -> int:
    """Na partida (réplica única) devolve à fila o que ficou em processing por uma queda."""
    result = session.execute(update(Inbox).where(Inbox.status == "processing").values(status="pending"))
    return result.rowcount
