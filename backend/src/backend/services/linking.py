import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.models.db import ChannelLink, LinkAttempt, LinkCode, User

CODE_TTL = timedelta(minutes=15)
ATTEMPT_WINDOW = timedelta(minutes=15)
MAX_ATTEMPTS = 5
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I/L
CODE_RE = re.compile(r"IRON-?([A-Z0-9]{6})", re.IGNORECASE)


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def extract_code(text: str) -> str | None:
    match = CODE_RE.search(text or "")
    return f"IRON-{match.group(1).upper()}" if match else None


def create_link_code(session: Session, user: User, now: datetime | None = None) -> tuple[str, datetime]:
    """Gera um código novo e invalida os anteriores ainda não usados."""
    now = now or datetime.now(UTC)
    session.execute(delete(LinkCode).where(LinkCode.user_id == user.id, LinkCode.used_at.is_(None)))
    while True:
        code = "IRON-" + "".join(secrets.choice(ALPHABET) for _ in range(6))
        if not session.scalars(select(LinkCode.id).where(LinkCode.code_hash == _hash(code))).first():
            break
    expires_at = now + CODE_TTL
    session.add(LinkCode(user_id=user.id, code_hash=_hash(code), expires_at=expires_at))
    session.flush()
    return code, expires_at


@dataclass
class LinkResult:
    status: str  # linked | already_linked | invalid | rate_limited | chat_taken
    user: User | None = None


def consume_link_code(
    session: Session, code: str, external_id: str, channel: str = "telegram", now: datetime | None = None
) -> LinkResult:
    """Valida o código (uso único, 15 min, tentativas limitadas por chat) e vincula o chat ao usuário."""
    now = now or datetime.now(UTC)
    recent = session.scalar(
        select(func.count())
        .select_from(LinkAttempt)
        .where(LinkAttempt.external_id == external_id, LinkAttempt.attempted_at > now - ATTEMPT_WINDOW)
    )
    if recent >= MAX_ATTEMPTS:
        return LinkResult("rate_limited")
    session.add(LinkAttempt(external_id=external_id, attempted_at=now))
    session.flush()

    # lock na linha do código impede que duas mensagens consumam o mesmo código
    link_code = session.scalars(
        select(LinkCode).where(LinkCode.code_hash == _hash(code)).with_for_update()
    ).first()
    if link_code is None or link_code.used_at is not None or link_code.expires_at <= now:
        return LinkResult("invalid")

    user = session.get(User, link_code.user_id)
    taken = session.scalars(
        select(ChannelLink).where(ChannelLink.channel == channel, ChannelLink.external_id == external_id)
    ).first()
    if taken and taken.user_id != user.id:
        return LinkResult("chat_taken")

    existing = session.scalars(select(ChannelLink).where(ChannelLink.user_id == user.id)).first()
    link_code.used_at = now
    if existing and existing.external_id == external_id and existing.channel == channel:
        return LinkResult("already_linked", user)
    if existing:
        session.delete(existing)
        session.flush()
    session.add(ChannelLink(user_id=user.id, channel=channel, external_id=external_id, linked_at=now))
    session.flush()
    return LinkResult("linked", user)
