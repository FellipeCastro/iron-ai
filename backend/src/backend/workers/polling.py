"""Long polling para desenvolvimento local: alimenta o mesmo inbox do webhook."""

import asyncio
import logging

from backend.utils.telegram import get_gateway
from backend.webhook.telegram import store_update

log = logging.getLogger("iron.polling")


def _poll_once(offset: int | None) -> int | None:
    gateway = get_gateway()
    for update in gateway.get_updates(offset, timeout=25):
        store_update(update)  # o update_id único no inbox torna reentregas inofensivas
        offset = update["update_id"] + 1
    return offset


async def _loop() -> None:
    gateway = get_gateway()
    await asyncio.to_thread(gateway.delete_webhook)  # getUpdates não funciona com webhook ativo
    offset: int | None = None
    while True:
        try:
            offset = await asyncio.to_thread(_poll_once, offset)
        except Exception:
            log.exception("erro no polling do Telegram")
            await asyncio.sleep(5)


def start() -> asyncio.Task:
    return asyncio.create_task(_loop())
