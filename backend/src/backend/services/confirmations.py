from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.models.db import PendingConfirmation, User
from backend.services.workouts import payload_to_routine_specs, save_routine

TTL = timedelta(minutes=30)


def create_pending(session: Session, user_id: int, kind: str, payload: dict, now: datetime | None = None) -> PendingConfirmation:
    now = now or datetime.now(UTC)
    session.execute(delete(PendingConfirmation).where(PendingConfirmation.user_id == user_id, PendingConfirmation.kind == kind))
    pending = PendingConfirmation(user_id=user_id, kind=kind, payload=payload, expires_at=now + TTL)
    session.add(pending)
    session.flush()
    return pending


def latest_pending(session: Session, user_id: int, now: datetime | None = None) -> PendingConfirmation | None:
    now = now or datetime.now(UTC)
    return session.scalars(
        select(PendingConfirmation)
        .where(PendingConfirmation.user_id == user_id, PendingConfirmation.expires_at > now)
        .order_by(PendingConfirmation.id.desc())
        .limit(1)
    ).first()


def resolve_pending(session: Session, user: User, accept: bool, pending_id: int | None = None, now: datetime | None = None) -> dict:
    """Aplica ou descarta uma confirmação pendente. Sem id, usa a mais recente."""
    now = now or datetime.now(UTC)
    if pending_id is not None:
        pending = session.scalars(
            select(PendingConfirmation).where(PendingConfirmation.id == pending_id, PendingConfirmation.user_id == user.id)
        ).first()
        if pending is not None and pending.expires_at <= now:
            pending = None
    else:
        pending = latest_pending(session, user.id, now)
    if pending is None:
        return {"status": "nothing_pending"}

    kind, payload = pending.kind, pending.payload
    session.delete(pending)
    session.flush()
    if not accept:
        return {"status": "cancelled", "kind": kind}
    if kind == "routine":
        routine = save_routine(session, user.id, payload_to_routine_specs(payload))
        return {"status": "saved", "kind": kind, "workouts": len(routine.workouts)}
    return {"status": "unknown_kind", "kind": kind}
