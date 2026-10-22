import asyncio
import logging

import sentry_sdk

from backend.services import conversation, inbox
from backend.utils.database import SessionLocal
from backend.utils.messaging import MessagingGateway
from backend.utils.telegram import get_gateway

log = logging.getLogger("iron.worker")

CONCURRENCY = 4
IDLE_SECONDS = 1.0


def process_one(gateway: MessagingGateway | None = None) -> bool:
    """Pega e processa a próxima mensagem elegível. Devolve False quando a fila está vazia."""
    gateway = gateway or get_gateway()
    with SessionLocal.begin() as session:
        row = inbox.claim_next(session)
        if row is None:
            return False
        inbox_id, payload = row.id, row.payload
    try:
        message = gateway.parse_update(payload)
        if message is not None:
            conversation.handle_message(gateway, message)
    except Exception as exc:
        log.exception("falha ao processar inbox %s", inbox_id)
        sentry_sdk.capture_exception(exc)
        with SessionLocal.begin() as session:
            status = inbox.mark_failed(session, inbox_id, repr(exc))
        if status == "failed":
            try:
                message = gateway.parse_update(payload)
                if message is not None:
                    gateway.send_text(message.external_id, conversation.ERROR_REPLY)
            except Exception:
                log.exception("não consegui avisar o usuário da falha")
        return True
    with SessionLocal.begin() as session:
        inbox.mark_done(session, inbox_id)
    return True


async def _loop() -> None:
    while True:
        try:
            worked = await asyncio.to_thread(process_one)
        except Exception:
            log.exception("erro no loop do worker")
            worked = False
        if not worked:
            await asyncio.sleep(IDLE_SECONDS)


def start() -> list[asyncio.Task]:
    with SessionLocal.begin() as session:
        stuck = inbox.reset_stuck(session)
    if stuck:
        log.warning("%s mensagens estavam em processing e voltaram para a fila", stuck)
    return [asyncio.create_task(_loop()) for _ in range(CONCURRENCY)]
