import base64

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    clerk_webhook_secret: str
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""
    cors_origins: str = "http://localhost:5173"

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    telegram_webhook_secret: str = ""
    telegram_mode: str = "polling"
    public_base_url: str = ""
    site_url: str = "http://localhost:5173"

    openai_api_key: str = ""
    iron_model_low: str = "gpt-4.1-mini"
    iron_model_medium: str = "gpt-4.1-mini"
    iron_model_high: str = "gpt-4.1"

    run_worker: bool = True
    run_scheduler: bool = True
    daily_message_limit: int = 100

    sentry_dsn: str = ""

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def clerk_issuer(self) -> str:
        """Domínio da instância do Clerk, embutido na chave pública (pk_test_<base64>$)."""
        if not self.clerk_publishable_key:
            return ""
        encoded = self.clerk_publishable_key.split("_", 2)[2]
        encoded += "=" * (-len(encoded) % 4)
        return "https://" + base64.b64decode(encoded).decode().rstrip("$")


settings = Settings()
