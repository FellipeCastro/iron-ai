from typing import Literal

from langchain_openai import ChatOpenAI

from backend.config import settings

Level = Literal["low", "medium", "high"]


def pick_llm(level: Level = "low") -> ChatOpenAI:
    """Escolhe o modelo pelo nível de complexidade. Os nomes vêm de variáveis de ambiente."""
    model = {
        "low": settings.iron_model_low,
        "medium": settings.iron_model_medium,
        "high": settings.iron_model_high,
    }[level]
    return ChatOpenAI(model=model, api_key=settings.openai_api_key, temperature=0, timeout=30, max_retries=1)
