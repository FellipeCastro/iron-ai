import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import routes
from backend.config import settings
from backend.services.catalog import seed_catalog
from backend.utils.database import SessionLocal
from backend.webhook import clerk, telegram
from backend.workers import inbox_worker, polling, reminders

logging.basicConfig(level=logging.INFO)

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, send_default_pii=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal.begin() as session:
        seed_catalog(session)

    tasks = []
    scheduler = None
    if settings.telegram_bot_token:
        gateway = telegram.get_gateway()
        if settings.telegram_mode == "webhook":
            if settings.public_base_url:
                gateway.set_webhook(f"{settings.public_base_url.rstrip('/')}/webhook/telegram", settings.telegram_webhook_secret)
        else:
            tasks.append(polling.start())
        if settings.run_worker:
            tasks += inbox_worker.start()
        if settings.run_scheduler:
            scheduler = reminders.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)
    for task in tasks:
        task.cancel()


app = FastAPI(title="Iron API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(clerk.router)
app.include_router(telegram.router)
app.include_router(routes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
