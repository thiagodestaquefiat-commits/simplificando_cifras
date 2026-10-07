"""Contrato stateless: índices temporários e datas, nunca consulta banco pessoal."""

from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .actions import create_default_manager
from .events import Event, EventService


def resolve_snapshot(payload: dict, *, clock=None) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Envie um objeto JSON.")
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 500:
        raise ValueError("Informe um comando com até 500 caracteres.")
    zone = payload.get("timezone", "America/Sao_Paulo")
    if not isinstance(zone, str) or len(zone) > 64:
        raise ValueError("Fuso inválido.")
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Fuso inválido.") from None
    rows = payload.get("events", [])
    if not isinstance(rows, list) or len(rows) > 250:
        raise ValueError("Envie no máximo 250 datas de eventos.")
    events, used = [], set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Evento inválido.")
        index = row.get("id")
        if type(index) is not int or not 0 <= index < 250 or index in used:
            raise ValueError("Índice temporário inválido.")
        value = row.get("startsAt")
        if not isinstance(value, str) or len(value) > 40:
            raise ValueError("Data inválida.")
        try:
            starts_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
            events.append(Event(index, "o evento solicitado", starts_at))
        except (ValueError, TypeError):
            raise ValueError("Informe uma data ISO com fuso horário.") from None
        used.add(index)
    # O caller fornece seu próprio contexto, não recebe qualquer dado do servidor.
    # A ação é só uma sugestão de UI; permissões continuam nas rotas de negócio.
    result = create_default_manager(EventService(events, timezone=zone, clock=clock)).handle(text)
    return {**result, "engine": "python"}
