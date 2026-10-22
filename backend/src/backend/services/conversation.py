import re

from backend.config import settings
from backend.models.db import User
from backend.services import chat, confirmations, linking, users
from backend.utils.database import SessionLocal
from backend.utils.messaging import Button, IncomingMessage, MessagingGateway

LIMIT_NOTICE = "Você atingiu o limite de mensagens de hoje. Volte amanhã para continuar registrando seus treinos."
UNKNOWN_CHAT = "Oi! Eu sou o Iron, seu parceiro de treino. Para começar, crie sua conta e vincule o Telegram em {site}."
RATE_LIMITED = "Muitas tentativas de vínculo. Aguarde 15 minutos e gere um novo código no site."
INVALID_CODE = "Esse código é inválido ou expirou. Gere um novo em {site}/vincular."
CHAT_TAKEN = "Esse Telegram já está vinculado a outra conta."
LINKED = (
    "Conta vinculada! Bora começar.\n\n"
    "Pra começar, me conta seu treino atual: quais exercícios você faz e quantas séries de cada?"
)
ALREADY_LINKED = "Seu Telegram já está vinculado. Me mande suas séries quando quiser."
ERROR_REPLY = "Tive um problema para processar sua mensagem. Tente de novo em instantes."


def send_reply(gateway: MessagingGateway, chat_id: str, text: str, buttons: list[tuple[str, str]] | None = None) -> None:
    """Cada bloco separado por linha em branco vira uma mensagem; os botões vão na última."""
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()] or [text]
    for part in parts[:-1]:
        gateway.send_text(chat_id, part)
    if buttons:
        gateway.send_buttons(chat_id, parts[-1], [Button(label, data) for label, data in buttons])
    else:
        gateway.send_text(chat_id, parts[-1])


def _site() -> str:
    return settings.site_url.rstrip("/")


def _handle_unknown(gateway: MessagingGateway, msg: IncomingMessage) -> None:
    if msg.callback_id:
        gateway.answer_callback(msg.callback_id)
        return
    code = linking.extract_code(msg.text or "")
    if code is None:
        gateway.send_text(msg.external_id, UNKNOWN_CHAT.format(site=_site()))
        return
    with SessionLocal.begin() as session:
        result = linking.consume_link_code(session, code, msg.external_id, msg.channel)
        linked_user_id = result.user.id if result.status == "linked" else None
    replies = {
        "linked": LINKED,
        "already_linked": ALREADY_LINKED,
        "rate_limited": RATE_LIMITED,
        "chat_taken": CHAT_TAKEN,
        "invalid": INVALID_CODE.format(site=_site()),
    }
    send_reply(gateway, msg.external_id, replies[result.status])
    if linked_user_id is not None:  # o agente precisa ver a pergunta para entender a resposta do usuário
        with SessionLocal.begin() as session:
            chat.add_message(session, linked_user_id, "assistant", LINKED)


def _handle_callback(gateway: MessagingGateway, user: User, msg: IncomingMessage) -> None:
    gateway.answer_callback(msg.callback_id)
    action, _, raw_id = (msg.callback_data or "").partition(":")
    if action not in ("confirm", "cancel") or not raw_id.isdigit():
        return
    with SessionLocal.begin() as session:
        db_user = session.get(User, user.id)
        result = confirmations.resolve_pending(session, db_user, action == "confirm", int(raw_id))
    texts = {
        "saved": "Rotina salva! Seu próximo treino já está pronto. Pode mandar as séries quando começar.",
        "cancelled": "Tudo bem, descartei. Me diga o que quer ajustar.",
        "nothing_pending": "Essa confirmação já foi usada ou expirou.",
    }
    gateway.send_text(msg.external_id, texts.get(result["status"], ERROR_REPLY))


def handle_message(gateway: MessagingGateway, msg: IncomingMessage) -> None:
    """Processa um item do inbox: vínculo, botões ou conversa com o agente."""
    with SessionLocal() as session:
        user = users.user_by_channel(session, msg.channel, msg.external_id)
    if user is None:
        _handle_unknown(gateway, msg)
        return
    if msg.callback_data is not None:
        _handle_callback(gateway, user, msg)
        return
    text = (msg.text or "").strip()
    if not text:
        return
    if text.startswith("/start"):
        gateway.send_text(msg.external_id, ALREADY_LINKED)
        return

    with SessionLocal.begin() as session:
        count, _ = chat.count_message(session, session.get(User, user.id))
    if chat.over_limit(count):
        if count == settings.daily_message_limit + 1:  # avisa uma vez; o resto é ignorado em silêncio
            gateway.send_text(msg.external_id, LIMIT_NOTICE)
        return

    from backend.agents.iron_agent import respond  # import tardio: o agente carrega langchain

    reply = respond(user.id, text)
    with SessionLocal.begin() as session:
        chat.add_message(session, user.id, "user", text)
        chat.add_message(session, user.id, "assistant", reply.text)
    send_reply(gateway, msg.external_id, reply.text, reply.buttons)
