from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Button:
    label: str
    data: str


@dataclass(frozen=True)
class IncomingMessage:
    """Evento já normalizado, independente do canal."""

    update_id: int
    channel: str
    external_id: str  # chat_id no Telegram
    text: str | None = None
    callback_data: str | None = None
    callback_id: str | None = None


class MessagingGateway(Protocol):
    channel: str

    def send_text(self, external_id: str, text: str) -> None: ...

    def send_buttons(self, external_id: str, text: str, buttons: list[Button]) -> None: ...

    def answer_callback(self, callback_id: str) -> None: ...

    def parse_update(self, payload: dict) -> IncomingMessage | None: ...
