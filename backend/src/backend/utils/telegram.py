import httpx

from backend.config import settings
from backend.utils.messaging import Button, IncomingMessage

MAX_TEXT = 4096


class TelegramError(Exception):
    pass


class TelegramGateway:
    channel = "telegram"

    def __init__(self, token: str | None = None, client: httpx.Client | None = None):
        self._token = token or settings.telegram_bot_token
        self._client = client or httpx.Client(timeout=40)

    def call(self, method: str, **params) -> dict | list | bool:
        response = self._client.post(f"https://api.telegram.org/bot{self._token}/{method}", json=params)
        data = response.json()
        if not data.get("ok"):
            raise TelegramError(f"{method}: {data.get('description', response.status_code)}")
        return data["result"]

    def send_text(self, external_id: str, text: str) -> None:
        for start in range(0, len(text), MAX_TEXT):
            self.call("sendMessage", chat_id=external_id, text=text[start : start + MAX_TEXT])

    def send_buttons(self, external_id: str, text: str, buttons: list[Button]) -> None:
        keyboard = [[{"text": b.label, "callback_data": b.data} for b in buttons]]
        self.call("sendMessage", chat_id=external_id, text=text[:MAX_TEXT], reply_markup={"inline_keyboard": keyboard})

    def answer_callback(self, callback_id: str) -> None:
        self.call("answerCallbackQuery", callback_query_id=callback_id)

    def parse_update(self, payload: dict) -> IncomingMessage | None:
        update_id = payload.get("update_id")
        if update_id is None:
            return None
        message = payload.get("message")
        if message and message.get("chat", {}).get("type") == "private":
            return IncomingMessage(
                update_id=update_id,
                channel=self.channel,
                external_id=str(message["chat"]["id"]),
                text=message.get("text"),
            )
        callback = payload.get("callback_query")
        if callback and callback.get("message"):
            return IncomingMessage(
                update_id=update_id,
                channel=self.channel,
                external_id=str(callback["message"]["chat"]["id"]),
                callback_data=callback.get("data"),
                callback_id=callback["id"],
            )
        return None

    # --- configuração do bot --------------------------------------------------------------------

    def set_webhook(self, url: str, secret: str) -> None:
        self.call("setWebhook", url=url, secret_token=secret, allowed_updates=["message", "callback_query"])

    def delete_webhook(self) -> None:
        self.call("deleteWebhook")

    def get_updates(self, offset: int | None, timeout: int = 30) -> list[dict]:
        params: dict = {"timeout": timeout, "allowed_updates": ["message", "callback_query"]}
        if offset is not None:
            params["offset"] = offset
        return self.call("getUpdates", **params)  # type: ignore[return-value]


_gateway: TelegramGateway | None = None


def get_gateway() -> TelegramGateway:
    global _gateway
    if _gateway is None:
        _gateway = TelegramGateway()
    return _gateway
