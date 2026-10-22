from fastapi import FastAPI

from backend.webhook import clerk

app = FastAPI(title="Iron")
app.include_router(clerk.router)


@app.get("/health")
def health():
    return {"status": "ok"}
