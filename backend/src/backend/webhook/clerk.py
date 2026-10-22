import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from svix.webhooks import Webhook, WebhookVerificationError

from backend.config import settings
from backend.models.db import User
from backend.utils.database import SessionLocal

router = APIRouter()


def _primary_email(data: dict) -> str | None:
    primary_id = data.get("primary_email_address_id")
    for item in data.get("email_addresses", []):
        if item["id"] == primary_id:
            return item["email_address"]
    return None


def _apply_event(event: dict) -> None:
    data = event["data"]
    with SessionLocal.begin() as session:
        if event["type"] in ("user.created", "user.updated"):
            name = f'{data.get("first_name") or ""} {data.get("last_name") or ""}'.strip() or None
            values = {"clerk_id": data["id"], "email": _primary_email(data), "name": name}
            stmt = insert(User).values(**values)
            session.execute(
                stmt.on_conflict_do_update(
                    index_elements=[User.clerk_id],
                    set_={"email": stmt.excluded.email, "name": stmt.excluded.name},
                )
            )
        elif event["type"] == "user.deleted":
            session.execute(delete(User).where(User.clerk_id == data["id"]))


@router.post("/webhook/clerk")
async def clerk_webhook(request: Request):
    payload = await request.body()
    try:
        Webhook(settings.clerk_webhook_secret).verify(payload, dict(request.headers))
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="invalid signature")

    await run_in_threadpool(_apply_event, json.loads(payload))
    return {"ok": True}
