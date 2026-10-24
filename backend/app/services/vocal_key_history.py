"""Tons por vocalista, limitados ao repertório oficial de cada evento.

Não lê variantes pessoais nem escreve em PersonalSong/SharedSong. A data do
evento, não sua última edição, define a apresentação mais recente. Datas de
hoje ainda não contam como apresentações concluídas (não há término no modelo).
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

from ..database import db
from ..models import CollaborationUser, Event, EventMember, EventRepertoireItem, VocalKeyMemory

LOCAL_ZONE = ZoneInfo("America/Sao_Paulo")
NOTES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _fold(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(value or "")).casefold() if not unicodedata.combining(c)).split())


def is_vocalist(role):
    return _fold(role) in {"vocal", "vocalista"}


def song_identity(item):
    # IDs locais podem coincidir entre contas; nunca usar song_id sozinho.
    title, artist = _fold(item.shared_title), _fold(item.shared_artist)
    if not title or not artist:
        return None
    return hashlib.sha256(json.dumps([title, artist], ensure_ascii=False).encode()).hexdigest()


def musical_key(value):
    match = re.fullmatch(r"([A-Ga-g])([#b]?)(m|M|maj|min|menor|maior)?", str(value or "").strip().replace("♯", "#").replace("♭", "b"))
    if not match:
        return None
    note, accidental, quality = match.groups()
    minor = quality in {"m", "min", "menor"}
    spelling = note.upper() + accidental + ("m" if minor else "")
    pitch = (NOTES[note.upper()] + {"": 0, "#": 1, "b": -1}[accidental]) % 12
    return spelling, (pitch, minor)


def _instant(event):
    try:
        date = datetime.strptime(event.event_date, "%Y-%m-%d").date()
        hour = datetime.strptime(event.event_time, "%H:%M").time() if event.event_time else time.min
        return datetime.combine(date, hour, LOCAL_ZONE).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def vocalist_ids(event):
    db.session.flush()
    return {row.user_id for row in EventMember.query.filter_by(event_id=event.id).all() if is_vocalist(row.role)}


def refresh_history(people, now=None):
    """Carrega o legado e guarda a memória antes de eventual exclusão do evento."""
    if not people:
        return {}
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(LOCAL_ZONE).date()
    # Serializa gravações da mesma memória em eventos concorrentes, inclusive
    # quando a linha da música ainda não existe. Ordem fixa evita travas cruzadas.
    registered = {row.id for row in CollaborationUser.query.filter(CollaborationUser.id.in_(people)).order_by(CollaborationUser.id).with_for_update().all()}
    memories = {(row.vocalist_id, row.song_identity): row for row in VocalKeyMemory.query.filter(VocalKeyMemory.vocalist_id.in_(people)).all()}
    rows = (db.session.query(Event, EventMember).join(EventMember, EventMember.event_id == Event.id)
            .filter(EventMember.user_id.in_(people), Event.event_date < today.isoformat()).all())
    items_by_event = defaultdict(list)
    event_ids = {event.id for event, _ in rows}
    if event_ids:
        for item in EventRepertoireItem.query.filter(EventRepertoireItem.event_id.in_(event_ids)).all():
            items_by_event[item.event_id].append(item)
    for event, member in rows:
        instant = _instant(event)
        if not is_vocalist(member.role) or instant is None or instant.astimezone(LOCAL_ZONE).date() >= today:
            continue
        if member.user_id not in registered:
            continue  # Vínculos locais legados sem conta não são outra identidade.
        for item in items_by_event[event.id]:
            identity, key = song_identity(item), musical_key(item.shared_key)
            if not identity or not key:
                continue
            pair = member.user_id, identity
            current = memories.get(pair)
            rank = instant, event.id, item.position
            if current and rank < (_utc(current.performed_at), current.source_event_id, current.source_position):
                continue
            if current is None:
                current = VocalKeyMemory(vocalist_id=member.user_id, song_identity=identity)
                db.session.add(current)
                memories[pair] = current
            current.song_key, current.performed_at = key[0], instant
            current.source_event_id, current.source_position = event.id, item.position
    return memories


def mark_manual_edit(item, key, sheet, sheet_key=""):
    """Estado só do servidor; payloads não podem limpar o bloqueio manual."""
    state = dict(item.vocal_key_state or {})
    if key != item.shared_key:
        state["manual"] = True
    if sheet != item.shared_chord_sheet:
        state["sheetKey"] = sheet_key or key
    elif sheet_key:
        state["sheetKey"] = sheet_key
    elif key != item.shared_key:
        state.setdefault("sheetKey", item.shared_key)
    item.vocal_key_state = state


def adapt_event(event, item_ids=None, now=None):
    """Chamado em mutações autorizadas, nunca em GET; retorna alterações auditáveis."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(LOCAL_ZONE).date()
    instant = _instant(event)
    people = vocalist_ids(event)
    memories = refresh_history(people, now)
    if event.event_date and (instant is None or instant.astimezone(LOCAL_ZONE).date() < today):
        return []
    changed = []
    items = EventRepertoireItem.query.filter_by(event_id=event.id).order_by(EventRepertoireItem.position).all()
    for item in items:
        if item_ids is not None and item.id not in item_ids:
            continue
        state = dict(item.vocal_key_state or {})
        if state.get("manual"):
            continue
        identity = song_identity(item)
        candidates = [musical_key(memories[(person, identity)].song_key) for person in sorted(people) if (person, identity) in memories]
        candidates = [candidate for candidate in candidates if candidate]
        if not candidates or len({candidate[1] for candidate in candidates}) != 1:
            continue  # Conflito: conservar o tom atual, sem escolher um vocalista.
        target = candidates[0][0]
        current_key = musical_key(item.shared_key)
        source_key = current_key or musical_key((item.shared_song_data or {}).get("key") or (item.shared_song_data or {}).get("originalKey"))
        if not source_key:
            continue  # Não inventar uma origem para transpor conteúdo sem tom.
        if source_key[1][1] != candidates[0][1][1]:
            continue  # Maior/menor exige reharmonização, não apenas transposição.
        if current_key and current_key[1] == candidates[0][1]:
            continue
        # chordSheet continua no tom-fonte; o renderer transpõe sem tocar a cópia original.
        state.setdefault("sheetKey", source_key[0])
        state["manual"] = False
        before = item.shared_key
        item.shared_key, item.vocal_key_state = target, state
        changed.append((item, before, target))
    return changed
