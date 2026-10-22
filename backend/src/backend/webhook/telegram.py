import hmac

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from backend.config import settings
from backend.services import inbox
from backend.utils.database import SessionLocal
from backend.utils.telegram import get_gateway

router = APIRouter()


def store_update(payload: dict) -> bool:
    """Normaliza e grava um update do Telegram no inbox. Usado pelo webhook e pelo polling."""
    message = get_gateway().parse_update(payload)
    if message is None:
        return False
    with SessionLocal.begin() as session:
        return inbox.enqueue(session, message, payload)


@router.post("/webhook/telegram")
async def telegram_webhook(request: Request):
    secret = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not settings.telegram_webhook_secret or not hmac.compare_digest(secret, settings.telegram_webhook_secret):
        raise HTTPException(status_code=401, detail="invalid secret")
    payload = await request.json()
    await run_in_threadpool(store_update, payload)
    return {"ok": True}
