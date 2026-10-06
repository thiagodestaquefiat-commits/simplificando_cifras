from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from ..database import db
from .. import limiter
from ..errors import ApiError
from ..models import (
    CollaborationUser,
    UserHandle,
    Band,
    BandMember,
    Event,
    EventInvitation,
    DirectEventInvitation,
    EventChange,
    EventMessage,
    ExternalIdentity,
    EventMember,
    EventRepertoireItem,
    PersonalRepertoireOverride,
    UserAccessToken,
)
from ..services.collaboration_auth import authenticated, issue_access_token, token_digest


blueprint = Blueprint("events", __name__, url_prefix="/api/collaboration")


@blueprint.get("/capabilities")
def collaboration_capabilities():
    response = jsonify({"eventSongData": 1, "catalogContribution": "initial-online-upload-only", "textManualPrivate": True, "personalEditsPrivate": True})
    response.headers["Cache-Control"] = "no-store"
    return response

IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]{3,120}$")
# Formato canônico de UUID (8-4-4-4-12 hex) — é o formato que o Supabase usa
# para `subject`. Reservado: um id de CollaborationUser criado por aqui nunca
# pode ter essa forma, senão um cliente poderia registrar antecipadamente um
# id que mais tarde coincida com o `subject` de uma conta Supabase real que
# ainda não logou (collaboration_auth.py reaproveita `subject` como user_id
# na ausência de ExternalIdentity). Outros formatos de id (os usados hoje
# pelo ROUDY, como "user_"+hex ou nomes livres) continuam sem restrição.
CANONICAL_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def _json() -> dict:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.", 400)
    return payload


def _text(value, maximum: int, field: str, required: bool = False) -> str:
    result = str(value or "").strip()
    if required and not result:
        raise ApiError("entrada_invalida", f"O campo {field} é obrigatório.", 400)
    if len(result) > maximum:
        raise ApiError("entrada_invalida", f"O campo {field} excede {maximum} caracteres.", 400)
    return result


def _identifier(value, field: str, fallback: str | None = None) -> str:
    result = str(value or fallback or "").strip()
    if not IDENTIFIER.fullmatch(result):
        raise ApiError("entrada_invalida", f"O campo {field} possui um identificador inválido.", 400)
    return result


def _expected_version(payload: dict, current: int) -> None:
    value = payload.get("remoteVersion")
    if value is None:
        return
    try:
        expected = int(value)
    except (TypeError, ValueError):
        raise ApiError("entrada_invalida", "remoteVersion precisa ser um número inteiro.", 400) from None
    if expected != current:
        raise ApiError("versao_desatualizada", "O repertório foi alterado por outra sessão. Recarregue antes de salvar.", 409)


def _location_payload(payload: dict) -> dict:
    raw = payload.get("eventLocation")
    if raw in (None, ""):
        return {
            "name": "", "formattedAddress": "", "street": "", "streetNumber": "",
            "district": "", "city": "", "state": "", "postalCode": "", "country": "",
            "latitude": None, "longitude": None, "placeId": "", "provider": "",
        }
    if not isinstance(raw, dict):
        raise ApiError("entrada_invalida", "eventLocation precisa ser um objeto.", 400)
    latitude, longitude = raw.get("latitude"), raw.get("longitude")
    if (latitude is None) != (longitude is None):
        raise ApiError("coordenadas_invalidas", "Latitude e longitude devem ser informadas juntas.", 400)
    if latitude is not None:
        try:
            latitude, longitude = float(latitude), float(longitude)
        except (TypeError, ValueError):
            raise ApiError("coordenadas_invalidas", "Latitude e longitude precisam ser números.", 400) from None
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ApiError("coordenadas_invalidas", "As coordenadas informadas são inválidas.", 400)
    return {
        "name": _text(raw.get("name"), 200, "eventLocation.name"),
        "formattedAddress": _text(raw.get("formattedAddress"), 500, "eventLocation.formattedAddress"),
        "street": _text(raw.get("street"), 200, "eventLocation.street"),
        "streetNumber": _text(raw.get("streetNumber"), 40, "eventLocation.streetNumber"),
        "district": _text(raw.get("district"), 160, "eventLocation.district"),
        "city": _text(raw.get("city"), 160, "eventLocation.city"),
        "state": _text(raw.get("state"), 120, "eventLocation.state"),
        "postalCode": _text(raw.get("postalCode"), 40, "eventLocation.postalCode"),
        "country": _text(raw.get("country"), 120, "eventLocation.country"),
        "latitude": latitude,
        "longitude": longitude,
        "placeId": _text(raw.get("placeId"), 240, "eventLocation.placeId"),
        "provider": _text(raw.get("provider"), 40, "eventLocation.provider"),
    }


def _assign_location(event: Event, value: dict) -> None:
    event.location_name = value["name"]
    event.formatted_address = value["formattedAddress"]
    event.location_street = value["street"]
    event.location_street_number = value["streetNumber"]
    event.location_district = value["district"]
    event.location_city = value["city"]
    event.location_state = value["state"]
    event.location_postal_code = value["postalCode"]
    event.location_country = value["country"]
    event.latitude = value["latitude"]
    event.longitude = value["longitude"]
    event.location_place_id = value["placeId"]
    event.location_provider = value["provider"]


def _event_or_404(event_id: str) -> Event:
    event = db.session.get(Event, str(event_id))
    if event is None:
        raise ApiError("evento_nao_encontrado", "O evento não foi encontrado.", 404)
    return event


def _band_id_payload(payload: dict, members: list[dict]) -> str | None:
    raw = str(payload.get("bandId") or "").strip()
    if not raw:
        return None
    band_id = _identifier(raw, "bandId")
    band = db.session.get(Band, band_id)
    if band is None:
        raise ApiError("equipe_nao_encontrada", "A equipe selecionada não foi encontrada.", 404)
    band_members = {item.user_id for item in BandMember.query.filter_by(band_id=band.id).all()}
    if g.current_user.id not in band_members:
        raise ApiError("acesso_negado", "Você não integra a equipe selecionada.", 403)
    outside = [item["id"] for item in members if item["id"] not in band_members]
    if outside:
        raise ApiError("membro_fora_da_equipe", "Todos os participantes do evento precisam integrar a equipe selecionada.", 400)
    return band_id


def _member(event: Event, user_id: str) -> EventMember:
    member = EventMember.query.filter_by(event_id=event.id, user_id=user_id).first()
    if member is None:
        raise ApiError("acesso_negado", "Somente integrantes podem acessar este evento.", 403)
    return member


def _leader(event: Event, user_id: str) -> EventMember:
    member = _member(event, user_id)
    if event.leader_id != user_id:
        raise ApiError("somente_lider", "Somente o líder pode alterar o repertório compartilhado.", 403)
    return member


def _change(event: Event, kind: str, summary: str) -> None:
    db.session.add(EventChange(
        id=str(uuid.uuid4()),
        event_id=event.id,
        actor_id=g.current_user.id,
        actor_name=g.current_user.name,
        kind=kind,
        summary=summary,
    ))


def _iso(value) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _serialize_message(message: EventMessage) -> dict:
    return {
        "id": message.id,
        "eventId": message.event_id,
        "type": message.message_type,
        "sender": {"id": message.sender_id, "name": message.sender_name, "avatarUrl": message.sender_avatar_url},
        "content": "" if message.deleted else message.content,
        "replyTo": message.reply_to,
        "poll": message.poll,
        "reactions": message.reactions or {},
        "deleted": message.deleted,
        "createdAt": _iso(message.created_at),
        "editedAt": _iso(message.edited_at) if message.edited_at else None,
    }


def _datetime(value, fallback: datetime) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return fallback


def _restore_legacy_changes(event: Event, payload: dict) -> bool:
    if payload.get("legacyMigration") is not True or not isinstance(payload.get("notifications"), list):
        return False
    restored = False
    seen: set[str] = set()
    for raw in payload["notifications"][-50:]:
        if not isinstance(raw, dict):
            continue
        change_id = _text(raw.get("id"), 36, "notifications.id") or str(uuid.uuid4())
        if change_id in seen or db.session.get(EventChange, change_id) is not None:
            continue
        seen.add(change_id)
        db.session.add(EventChange(
            id=change_id,
            event_id=event.id,
            actor_id=_text(raw.get("actorId"), 80, "notifications.actorId") or g.current_user.id,
            actor_name=_text(raw.get("actorName"), 120, "notifications.actorName") or g.current_user.name,
            kind=_text(raw.get("kind"), 80, "notifications.kind") or "event.updated",
            summary=_text(raw.get("summary"), 300, "notifications.summary") or "Atualizou o evento",
            created_at=_datetime(raw.get("createdAt"), datetime.now(timezone.utc)),
        ))
        restored = True
    return restored


def _serialize_event(event: Event, user_id: str) -> dict:
    overrides = {
        item.repertoire_item_id: item
        for item in PersonalRepertoireOverride.query.filter_by(event_id=event.id, user_id=user_id).all()
    }
    members = sorted(event.members, key=lambda item: (item.user_id != event.leader_id, item.name.casefold()))
    repertoire = []
    for item in sorted(event.repertoire, key=lambda value: value.position):
        personal = overrides.get(item.id)
        repertoire.append({
            "id": item.id,
            "songId": item.song_id,
            "order": item.position,
            "shared": {
                "title": item.shared_title, "artist": item.shared_artist,
                "key": item.shared_key, "capo": item.shared_capo,
                **({"songData": item.shared_song_data} if item.shared_song_data else {}),
                "chordSheet": item.shared_chord_sheet, "notes": item.shared_notes,
            },
            "personal": None if personal is None else {
                "title": personal.personal_title,
                "artist": personal.personal_artist,
                "key": personal.personal_key,
                **({"songData": personal.personal_song_data} if personal.personal_song_data else {}),
                "capo": personal.personal_capo,
                "chordSheet": personal.personal_chord_sheet,
                "notes": personal.personal_notes,
                "updatedAt": _iso(personal.updated_at),
            },
        })
    return {
        "id": event.id,
        "title": event.title,
        "date": event.event_date,
        "time": event.event_time,
        "location": event.location,
        "eventLocation": {
            "name": event.location_name,
            "formattedAddress": event.formatted_address,
            "street": event.location_street,
            "streetNumber": event.location_street_number,
            "district": event.location_district,
            "city": event.location_city,
            "state": event.location_state,
            "postalCode": event.location_postal_code,
            "country": event.location_country,
            "latitude": event.latitude,
            "longitude": event.longitude,
            "placeId": event.location_place_id,
            "provider": event.location_provider,
        } if event.latitude is not None and event.longitude is not None else None,
        "description": event.description,
        "bandId": event.band_id,
        "leaderId": event.leader_id,
        "creatorId": event.creator_id or event.leader_id,
        "remoteVersion": event.version,
        "members": [{
            "id": member.user_id,
            "name": member.name,
            "role": member.role,
            "avatarUrl": member.avatar_url,
            "isLeader": member.user_id == event.leader_id,
            "isCurrentUser": member.user_id == user_id,
        } for member in members],
        "repertoire": repertoire,
        "notifications": [{
            "id": item.id,
            "actorId": item.actor_id,
            "actorName": item.actor_name,
            "kind": item.kind,
            "summary": item.summary,
            "createdAt": _iso(item.created_at),
        } for item in list(event.changes)[-50:]],
        "permissions": {
            "isMember": any(member.user_id == user_id for member in event.members),
            "canEditShared": event.leader_id == user_id,
        },
        "createdAt": _iso(event.created_at),
        "updatedAt": _iso(event.updated_at),
    }


def _members_payload(payload: dict, actor) -> tuple[list[dict], str]:
    raw_members = payload.get("members", [])
    if not isinstance(raw_members, list):
        raise ApiError("entrada_invalida", "Membros deve ser uma lista.", 400)
    members: list[dict] = []
    seen: set[str] = set()
    for raw in raw_members:
        if not isinstance(raw, dict):
            raise ApiError("entrada_invalida", "Cada membro deve ser um objeto.", 400)
        user_id = _identifier(raw.get("id"), "members.id")
        if user_id in seen:
            continue
        seen.add(user_id)
        members.append({
            "id": user_id,
            "name": _text(raw.get("name"), 120, "members.name", True),
            "role": _text(raw.get("role"), 80, "members.role") or "Outra",
            "avatarUrl": _text(raw.get("avatarUrl"), 500, "members.avatarUrl") or None,
        })
    if actor.id not in seen:
        members.insert(0, {"id": actor.id, "name": actor.name, "role": "Liderança", "avatarUrl": actor.avatar_url})
    leader_id = _identifier(payload.get("leaderId"), "leaderId", actor.id)
    if leader_id not in {item["id"] for item in members}:
        raise ApiError("lider_invalido", "O líder precisa ser integrante do evento.", 400)
    migration = payload.get("legacyMigration") is True and leader_id == actor.id
    missing = [item["id"] for item in members if db.session.get(CollaborationUser, item["id"]) is None]
    if missing and not migration:
        raise ApiError(
            "membro_nao_registrado",
            "Antes de sincronizar, informe o ID exibido no aplicativo de cada integrante.",
            400,
        )
    return members, leader_id


def _event_song_data(value):
    if value is None:
        return None
    from .library import _payload
    fields = {"id", "title", "artist", "key", "capo", "blocos", "editorData", "fullChordSheet", "tablature", "playbackSettings", "bpm", "instrumento", "originalKey", "currentKey", "notes", "coverUrl", "youtubeVideoId", "youtubeUrl", "youtubeChannelTitle", "songFormatVersion"}
    if not isinstance(value, dict):
        raise ApiError("musica_invalida", "Cópia da música inválida.", 400)
    return _payload({key: item for key, item in value.items() if key in fields})


def _repertoire_payload(payload: dict) -> list[dict]:
    raw_items = payload.get("repertoire", [])
    if not isinstance(raw_items, list):
        raise ApiError("entrada_invalida", "Repertório deve ser uma lista.", 400)
    values: list[dict] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ApiError("entrada_invalida", "Cada item do repertório deve ser um objeto.", 400)
        item_id = _identifier(raw.get("id"), "repertoire.id", f"repertoire_{uuid.uuid4().hex}")
        if item_id in seen_ids:
            raise ApiError("entrada_invalida", "O repertório contém IDs duplicados.", 400)
        seen_ids.add(item_id)
        shared = raw.get("shared") if isinstance(raw.get("shared"), dict) else {}
        values.append({
            "id": item_id,
            "songId": _identifier(raw.get("songId"), "repertoire.songId"),
            "position": index,
            "title": _text(shared.get("title"), 160, "shared.title"),
            "artist": _text(shared.get("artist"), 160, "shared.artist"),
            "key": _text(shared.get("key"), 32, "shared.key"),
            "capo": _text(shared.get("capo"), 20, "shared.capo"),
            "chordSheet": _text(shared.get("chordSheet"), 100000, "shared.chordSheet"),
            "notes": _text(shared.get("notes"), 10000, "shared.notes"),
            "songData": _event_song_data(shared.get("songData")),
        })
    return values


def _replace_members(event: Event, members: list[dict]) -> None:
    by_id = {item.user_id: item for item in event.members}
    keep = {item["id"] for item in members}
    for existing in list(event.members):
        if existing.user_id not in keep:
            db.session.delete(existing)
    for value in members:
        existing = by_id.get(value["id"])
        if existing is None:
            db.session.add(EventMember(event_id=event.id, user_id=value["id"], name=value["name"], role=value["role"], avatar_url=value["avatarUrl"]))
        else:
            existing.name = value["name"]
            existing.role = value["role"]
            existing.avatar_url = value["avatarUrl"]


def _replace_repertoire(event: Event, items: list[dict]) -> None:
    by_id = {item.id: item for item in event.repertoire}
    keep = {item["id"] for item in items}
    for existing in list(event.repertoire):
        if existing.id not in keep:
            db.session.delete(existing)
        else:
            existing.position += 100000
    db.session.flush()
    for value in items:
        existing = by_id.get(value["id"])
        if existing is None:
            db.session.add(EventRepertoireItem(
                id=value["id"], event_id=event.id, song_id=value["songId"], position=value["position"],
                shared_title=value["title"], shared_artist=value["artist"], shared_key=value["key"],
                shared_capo=value["capo"], shared_chord_sheet=value["chordSheet"], shared_notes=value["notes"],
                shared_song_data=value["songData"],
            ))
        else:
            existing.song_id = value["songId"]
            existing.position = value["position"]
            existing.shared_title = value["title"]
            existing.shared_artist = value["artist"]
            existing.shared_key = value["key"]
            existing.shared_capo = value["capo"]
            existing.shared_chord_sheet = value["chordSheet"]
            existing.shared_notes = value["notes"]
            if value["songData"] is not None:
                existing.shared_song_data = value["songData"]


@blueprint.post("/users")
def register_user():
    payload = _json()
    user_id = _identifier(payload.get("id"), "id", f"user_{uuid.uuid4().hex}")
    if CANONICAL_UUID.fullmatch(user_id):
        raise ApiError("identificador_reservado", "Este formato de identificador é reservado para contas autenticadas.", 400)
    if db.session.get(CollaborationUser, user_id) is not None:
        raise ApiError("usuario_existente", "Este perfil já foi registrado neste dispositivo ou em outro.", 409)
    user = CollaborationUser(
        id=user_id,
        name=_text(payload.get("name"), 120, "name", True),
        avatar_url=_text(payload.get("avatarUrl"), 500, "avatarUrl") or None,
    )
    db.session.add(user)
    token = issue_access_token(user)
    db.session.commit()
    return jsonify({"user": {"id": user.id, "name": user.name, "avatarUrl": user.avatar_url}, "accessToken": token}), 201


@blueprint.get("/me")
@authenticated
def me():
    db.session.commit()
    return jsonify({"id": g.current_user.id, "name": g.current_user.name, "avatarUrl": g.current_user.avatar_url}), 200


@blueprint.post("/identity/claim")
@authenticated
def claim_legacy_identity():
    if g.get("auth_provider") != "supabase":
        raise ApiError("login_externo_necessario", "Entre com sua conta antes de migrar a identidade local.", 403)
    payload = _json()
    legacy_token_value = _text(payload.get("legacyToken"), 500, "legacyToken", True)
    legacy_token = UserAccessToken.query.filter_by(token_hash=token_digest(legacy_token_value), revoked_at=None).first()
    if legacy_token is None:
        raise ApiError("token_legado_invalido", "A identidade local anterior não pôde ser confirmada.", 400)
    old_user = db.session.get(CollaborationUser, legacy_token.user_id)
    new_user = g.current_user
    if old_user is None or old_user.id == new_user.id:
        return jsonify({"user": {"id": new_user.id, "name": new_user.name, "avatarUrl": new_user.avatar_url}, "migrated": False}), 200

    for event in Event.query.filter_by(leader_id=old_user.id).all():
        event.leader_id = new_user.id
    for event in Event.query.filter_by(creator_id=old_user.id).all():
        event.creator_id = new_user.id
    for member in EventMember.query.filter_by(user_id=old_user.id).all():
        duplicate = EventMember.query.filter_by(event_id=member.event_id, user_id=new_user.id).first()
        if duplicate:
            db.session.delete(member)
        else:
            member.user_id = new_user.id
            member.name = new_user.name
            member.avatar_url = new_user.avatar_url
    for override in PersonalRepertoireOverride.query.filter_by(user_id=old_user.id).all():
        duplicate = PersonalRepertoireOverride.query.filter_by(repertoire_item_id=override.repertoire_item_id, user_id=new_user.id).first()
        if duplicate:
            db.session.delete(override)
        else:
            override.user_id = new_user.id
    for change in EventChange.query.filter_by(actor_id=old_user.id).all():
        change.actor_id = new_user.id
        change.actor_name = new_user.name
    for invitation in EventInvitation.query.filter_by(accepted_by=old_user.id).all():
        invitation.accepted_by = new_user.id
    for band in Band.query.filter_by(owner_id=old_user.id).all():
        band.owner_id = new_user.id
    for member in BandMember.query.filter_by(user_id=old_user.id).all():
        duplicate = BandMember.query.filter_by(band_id=member.band_id, user_id=new_user.id).first()
        if duplicate:
            if member.access_role == "owner":
                duplicate.access_role = "owner"
            db.session.delete(member)
        else:
            member.user_id = new_user.id
    UserAccessToken.query.filter_by(user_id=old_user.id).delete(synchronize_session=False)
    db.session.flush()
    db.session.delete(old_user)
    db.session.commit()
    return jsonify({"user": {"id": new_user.id, "name": new_user.name, "avatarUrl": new_user.avatar_url}, "migrated": True}), 200


@blueprint.get("/events")
@authenticated
def list_events():
    events = Event.query.join(EventMember, EventMember.event_id == Event.id).filter(EventMember.user_id == g.current_user.id).order_by(Event.updated_at.desc()).all()
    result = [_serialize_event(event, g.current_user.id) for event in events]
    db.session.commit()
    return jsonify({"events": result}), 200


@blueprint.post("/events")
@authenticated
def create_event():
    payload = _json()
    event_id = _identifier(payload.get("id"), "id", f"event_{uuid.uuid4().hex}")
    if db.session.get(Event, event_id) is not None:
        raise ApiError("evento_existente", "Este evento já existe no banco compartilhado.", 409)
    members, requested_leader = _members_payload(payload, g.current_user)
    band_id = _band_id_payload(payload, members)
    if requested_leader != g.current_user.id:
        raise ApiError("lider_inicial_invalido", "O criador deve ser o líder inicial do evento.", 403)
    location_data = _location_payload(payload)
    event = Event(
        id=event_id,
        title=_text(payload.get("title"), 160, "title", True),
        event_date=_text(payload.get("date"), 10, "date"),
        event_time=_text(payload.get("time"), 5, "time"),
        location=_text(payload.get("location"), 240, "location"),
        description=_text(payload.get("description"), 10000, "description"),
        band_id=band_id,
        leader_id=g.current_user.id,
        creator_id=g.current_user.id,
        created_at=_datetime(payload.get("createdAt"), datetime.now(timezone.utc)),
        updated_at=_datetime(payload.get("updatedAt"), datetime.now(timezone.utc)),
    )
    _assign_location(event, location_data)
    db.session.add(event)
    db.session.flush()
    _replace_members(event, members)
    _replace_repertoire(event, _repertoire_payload(payload))
    if not _restore_legacy_changes(event, payload):
        _change(event, "event.created", "criou o evento e o repertório")
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 201


@blueprint.get("/events/<event_id>")
@authenticated
def get_event(event_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    result = _serialize_event(event, g.current_user.id)
    db.session.commit()
    return jsonify(result), 200


@blueprint.get("/events/<event_id>/messages")
@authenticated
def list_event_messages(event_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 200))
    except (TypeError, ValueError):
        limit = 100
    query = EventMessage.query.filter_by(event_id=event.id)
    before = request.args.get("before", "").strip()
    if before:
        query = query.filter(EventMessage.created_at < _datetime(before, datetime.now(timezone.utc)))
    values = list(reversed(query.order_by(EventMessage.created_at.desc()).limit(limit).all()))
    return jsonify({"messages": [_serialize_message(value) for value in values]}), 200


@blueprint.post("/events/<event_id>/messages")
@authenticated
def create_event_message(event_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    payload = _json()
    message_id = _text(payload.get("clientId"), 80, "clientId") or str(uuid.uuid4())
    existing = db.session.get(EventMessage, message_id)
    if existing is not None:
        if existing.event_id != event.id or existing.sender_id != g.current_user.id:
            raise ApiError("mensagem_existente", "Este identificador de mensagem já está em uso.", 409)
        return jsonify(_serialize_message(existing)), 200
    message_type = _text(payload.get("type"), 16, "type") or "text"
    if message_type not in {"text", "system", "poll"}:
        raise ApiError("tipo_invalido", "Tipo de mensagem inválido.", 400)
    content = _text(payload.get("content"), 5000 if message_type == "text" else 500, "content")
    poll = None
    if message_type == "poll":
        raw_poll = payload.get("poll") if isinstance(payload.get("poll"), dict) else {}
        question = _text(raw_poll.get("question"), 500, "poll.question", True)
        raw_options = raw_poll.get("options") if isinstance(raw_poll.get("options"), list) else []
        options = []
        for raw in raw_options[:10]:
            if not isinstance(raw, dict):
                continue
            label = _text(raw.get("label"), 240, "poll.options.label")
            if label:
                options.append({"id": _text(raw.get("id"), 80, "poll.options.id") or str(uuid.uuid4()), "label": label})
        if len(options) < 2:
            raise ApiError("enquete_invalida", "A enquete precisa de pelo menos duas opções.", 400)
        poll = {"question": question, "options": options, "multiple": bool(raw_poll.get("multiple")), "showVoters": raw_poll.get("showVoters") is not False, "votes": {}}
    elif not content:
        raise ApiError("mensagem_vazia", "Digite uma mensagem.", 400)
    message = EventMessage(
        id=message_id, event_id=event.id, sender_id=g.current_user.id,
        sender_name=g.current_user.name, sender_avatar_url=g.current_user.avatar_url,
        message_type=message_type, content=content, reply_to=_text(payload.get("replyTo"), 80, "replyTo") or None,
        poll=poll, reactions={},
    )
    db.session.add(message)
    db.session.commit()
    return jsonify(_serialize_message(message)), 201


@blueprint.patch("/events/<event_id>/messages/<message_id>")
@authenticated
def update_event_message(event_id: str, message_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    message = db.session.get(EventMessage, message_id)
    if message is None or message.event_id != event.id:
        raise ApiError("mensagem_nao_encontrada", "Mensagem não encontrada.", 404)
    payload = _json()
    action = _text(payload.get("action"), 20, "action", True)
    now = datetime.now(timezone.utc)
    if action in {"edit", "delete"}:
        if message.sender_id != g.current_user.id:
            raise ApiError("mensagem_de_outro_usuario", "Você só pode alterar suas mensagens.", 403)
        if action == "edit":
            if message.message_type != "text":
                raise ApiError("edicao_invalida", "Somente mensagens de texto podem ser editadas.", 400)
            message.content = _text(payload.get("content"), 5000, "content", True)
        else:
            message.deleted, message.content = True, ""
        message.edited_at = now
    elif action == "react":
        emoji = _text(payload.get("emoji"), 16, "emoji", True)
        if emoji not in {"👍", "❤️", "🙏"}:
            raise ApiError("reacao_invalida", "Reação inválida.", 400)
        reactions = dict(message.reactions or {})
        users = set(str(value) for value in reactions.get(emoji, []))
        if g.current_user.id in users:
            users.remove(g.current_user.id)
        else:
            users.add(g.current_user.id)
        reactions[emoji] = sorted(users)
        message.reactions = reactions
    elif action == "vote":
        if message.message_type != "poll" or not isinstance(message.poll, dict):
            raise ApiError("voto_invalido", "Esta mensagem não é uma enquete.", 400)
        option_id = _text(payload.get("optionId"), 80, "optionId", True)
        poll = dict(message.poll)
        if option_id not in {str(item.get("id")) for item in poll.get("options", [])}:
            raise ApiError("opcao_invalida", "Opção de enquete inválida.", 400)
        votes = {str(key): list(value or []) for key, value in dict(poll.get("votes") or {}).items()}
        if not poll.get("multiple"):
            votes = {key: [user for user in users if user != g.current_user.id] for key, users in votes.items()}
        selected = set(str(value) for value in votes.get(option_id, []))
        if g.current_user.id in selected:
            selected.remove(g.current_user.id)
        else:
            selected.add(g.current_user.id)
        votes[option_id] = sorted(selected)
        poll["votes"] = votes
        message.poll = poll
    else:
        raise ApiError("acao_invalida", "Ação de mensagem inválida.", 400)
    db.session.commit()
    return jsonify(_serialize_message(message)), 200


@blueprint.put("/events/<event_id>")
@authenticated
def update_event(event_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    payload = _json()
    _expected_version(payload, event.version)
    members, leader_id = _members_payload(payload, g.current_user)
    if leader_id != event.leader_id:
        raise ApiError("transferencia_exclusiva", "Use a opção de transferência de liderança para trocar o líder.", 403)
    band_id = _band_id_payload(payload, members)
    event.title = _text(payload.get("title"), 160, "title", True)
    event.event_date = _text(payload.get("date"), 10, "date")
    event.event_time = _text(payload.get("time"), 5, "time")
    event.location = _text(payload.get("location"), 240, "location")
    _assign_location(event, _location_payload(payload))
    event.description = _text(payload.get("description"), 10000, "description")
    event.band_id = band_id
    event.leader_id = leader_id
    event.version += 1
    event.updated_at = datetime.now(timezone.utc)
    _replace_members(event, members)
    _replace_repertoire(event, _repertoire_payload(payload))
    _change(event, "event.updated", "atualizou o evento e o repertório compartilhado")
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


@blueprint.patch("/events/<event_id>/leader")
@authenticated
def transfer_event_leadership(event_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    payload = _json()
    _expected_version(payload, event.version)
    next_leader_id = _identifier(payload.get("leaderId"), "leaderId")
    if next_leader_id == event.leader_id:
        raise ApiError("lider_inalterado", "Este integrante já é o líder do evento.", 400)
    next_leader = EventMember.query.filter_by(event_id=event.id, user_id=next_leader_id).first()
    if next_leader is None:
        raise ApiError("lider_invalido", "O novo líder precisa ser integrante do evento.", 400)
    event.leader_id = next_leader_id
    event.version += 1
    event.updated_at = datetime.now(timezone.utc)
    _change(event, "event.leader.transferred", f"transferiu a liderança para {next_leader.name}")
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


def _account_required():
    if g.auth_provider != "supabase":
        raise ApiError("login_necessario", "Entre com sua conta para acessar os convites.", 403)


def _public_profile(user):
    # Legacy profiles can use an email as their display name. Never expose it.
    name = user.name if "@" not in user.name else "Usuário Roudy"
    avatar = user.avatar_url if str(user.avatar_url or "").startswith("https://") else None
    handle = db.session.get(UserHandle, user.id)
    return {"id": user.id, "name": name, "avatarUrl": avatar, "username": handle.username if handle else None}


HANDLE_PATTERN = re.compile(r"^[a-z0-9_]{3,24}$")
RESERVED_HANDLES = {"admin", "administrator", "administrador", "roudy", "suporte", "support", "moderador", "root", "system"}


def _username(value):
    username = str(value or "").strip().lower()
    if not HANDLE_PATTERN.fullmatch(username) or username in RESERVED_HANDLES:
        raise ApiError("nome_usuario_invalido", "Use de 3 a 24 letras sem acento, números ou _. Este nome pode estar reservado.", 400)
    return username


@blueprint.get("/me/username")
@authenticated
def get_username():
    _account_required()
    handle = db.session.get(UserHandle, g.current_user.id)
    db.session.commit()
    return jsonify({"username": handle.username if handle else None})


@blueprint.get("/usernames/availability")
@authenticated
@limiter.limit("60 per minute", key_func=lambda: g.current_user.id)
def username_availability():
    _account_required()
    username = _username(request.args.get("username"))
    available = UserHandle.query.filter_by(username=username).first() is None
    db.session.commit()
    return jsonify({"username": username, "available": available})


@blueprint.post("/me/username")
@authenticated
@limiter.limit("20 per hour", key_func=lambda: g.current_user.id)
def claim_username():
    _account_required()
    username = _username(_json().get("username"))
    existing = db.session.get(UserHandle, g.current_user.id)
    if existing:
        if existing.username != username:
            raise ApiError("nome_usuario_fixo", "Seu nome de usuário já foi definido e não pode ser alterado.", 409)
        db.session.commit()
        return jsonify({"username": existing.username}), 200
    db.session.add(UserHandle(user_id=g.current_user.id, username=username))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        # Both uniqueness constraints are authoritative, even for concurrent requests.
        existing = db.session.get(UserHandle, g.current_user.id)
        if existing and existing.username == username:
            return jsonify({"username": username}), 200
        code = "nome_usuario_fixo" if existing else "nome_usuario_ocupado"
        raise ApiError(code, "O nome já foi definido nesta conta." if existing else "Este nome de usuário não está disponível.", 409) from None
    return jsonify({"username": username}), 201


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@blueprint.get("/directory/users")
@authenticated
@limiter.limit("60 per minute", key_func=lambda: g.current_user.id)
def search_registered_users():
    _account_required()
    query = _text(request.args.get("q"), 120, "q")
    try:
        offset = int(request.args.get("offset", 0))
    except ValueError:
        raise ApiError("entrada_invalida", "Página inválida.", 400) from None
    if not 0 <= offset <= 10000:
        raise ApiError("entrada_invalida", "Página inválida.", 400)
    if len(query.lstrip('@')) < 2:
        return jsonify({"users": [], "nextOffset": None})
    rows = (CollaborationUser.query.filter(
        CollaborationUser.id.in_(db.session.query(ExternalIdentity.user_id).filter_by(provider="supabase")),
        CollaborationUser.id != g.current_user.id,
        ~CollaborationUser.name.contains("@"),
        or_(CollaborationUser.name.ilike("%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%", escape="\\"),
            CollaborationUser.id.in_(db.session.query(UserHandle.user_id).filter(UserHandle.username.contains(query.lstrip('@').lower(), autoescape=True)))),
    ).order_by(CollaborationUser.name, CollaborationUser.id).offset(offset).limit(21).all())
    db.session.commit()
    return jsonify({"users": [_public_profile(user) for user in rows[:20]],
                    "nextOffset": offset + 20 if len(rows) > 20 else None})


def _direct_invitation_json(invitation, event):
    sender = db.session.get(CollaborationUser, invitation.created_by)
    band = db.session.get(Band, event.band_id) if event.band_id else None
    return {"id": invitation.id, "eventId": event.id, "eventTitle": event.title,
            "eventDate": event.event_date, "role": invitation.musical_role,
            "bandName": band.name if band else None,
            "inviter": _public_profile(sender) if sender else {"name": "Líder"},
            "expiresAt": _iso(invitation.expires_at)}


@blueprint.post("/events/<event_id>/direct-invitations")
@authenticated
@limiter.limit("20 per hour", key_func=lambda: g.current_user.id)
def create_direct_invitation(event_id):
    _account_required()
    event = Event.query.filter_by(id=event_id).with_for_update().first()
    if event is None:
        raise ApiError("evento_nao_encontrado", "Evento não encontrado.", 404)
    _leader(event, g.current_user.id)
    payload = _json()
    target_id = _identifier(payload.get("userId"), "userId")
    target = db.session.get(CollaborationUser, target_id)
    if target is None or not ExternalIdentity.query.filter_by(provider="supabase", user_id=target_id).first():
        raise ApiError("usuario_invalido", "Usuário não encontrado.", 404)
    if target_id == g.current_user.id or EventMember.query.filter_by(event_id=event.id, user_id=target_id).first():
        raise ApiError("ja_integrante", "Essa pessoa já participa do evento.", 409)
    role = _text(payload.get("role"), 80, "role") or "Outra"
    if role.casefold() in {"líder", "lider", "liderança", "lideranca"}:
        raise ApiError("funcao_invalida", "O convite não transfere liderança.", 400)
    now = datetime.now(timezone.utc)
    invitation = DirectEventInvitation.query.filter_by(event_id=event.id, recipient_id=target_id).with_for_update().first()
    if invitation and invitation.status == "pending" and _utc(invitation.expires_at) > now and invitation.created_by == event.leader_id:
        raise ApiError("convite_pendente", "Já existe um convite pendente para essa pessoa.", 409)
    if invitation is None:
        invitation = DirectEventInvitation(id=str(uuid.uuid4()), event_id=event.id, recipient_id=target_id)
        db.session.add(invitation)
    # A new id prevents an old notification from answering a reissued invitation.
    invitation.id = str(uuid.uuid4())
    invitation.created_by = g.current_user.id
    invitation.musical_role = role
    invitation.status = "pending"
    invitation.created_at = now
    invitation.expires_at = now + timedelta(days=7)
    invitation.responded_at = None
    db.session.commit()
    return jsonify(_direct_invitation_json(invitation, event)), 201


@blueprint.get("/direct-invitations")
@authenticated
@limiter.limit("60 per minute", key_func=lambda: g.current_user.id)
def list_direct_invitations():
    _account_required()
    rows = (db.session.query(DirectEventInvitation, Event).join(Event, Event.id == DirectEventInvitation.event_id)
            .filter(DirectEventInvitation.recipient_id == g.current_user.id,
                    DirectEventInvitation.status == "pending",
                    DirectEventInvitation.expires_at > datetime.now(timezone.utc),
                    DirectEventInvitation.created_by == Event.leader_id)
            .order_by(DirectEventInvitation.created_at.desc()).all())
    result = [_direct_invitation_json(invitation, event) for invitation, event in rows]
    db.session.commit()
    return jsonify({"invitations": result})


@blueprint.post("/direct-invitations/<invitation_id>/respond")
@authenticated
def respond_direct_invitation(invitation_id):
    _account_required()
    action = _json().get("action")
    if action not in {"accept", "reject"}:
        raise ApiError("entrada_invalida", "Escolha aceitar ou rejeitar.", 400)
    # Lock event before invitation, in the same order as invitation creation.
    initial = DirectEventInvitation.query.filter_by(id=invitation_id, recipient_id=g.current_user.id).first()
    if initial is None:
        raise ApiError("convite_invalido", "Convite não encontrado.", 404)
    event = Event.query.filter_by(id=initial.event_id).with_for_update().first()
    invitation = DirectEventInvitation.query.filter_by(id=invitation_id, recipient_id=g.current_user.id).populate_existing().with_for_update().first()
    if invitation is None or event is None:
        raise ApiError("convite_invalido", "Convite não encontrado.", 404)
    if invitation.status != "pending":
        if invitation.status == "accepted" and action == "accept":
            _member(event, g.current_user.id)
            return jsonify({"event": _serialize_event(event, g.current_user.id)})
        if invitation.status == "rejected" and action == "reject":
            return jsonify({"status": "rejected"})
        raise ApiError("convite_respondido", "O convite já foi respondido.", 409)
    if _utc(invitation.expires_at) <= datetime.now(timezone.utc) or invitation.created_by != event.leader_id:
        raise ApiError("convite_expirado", "Convite expirado. Peça um novo convite ao líder.", 410)
    if action == "accept":
        if not EventMember.query.filter_by(event_id=event.id, user_id=g.current_user.id).first():
            db.session.add(EventMember(event_id=event.id, user_id=g.current_user.id, name=_public_profile(g.current_user)["name"],
                                       avatar_url=g.current_user.avatar_url, role=invitation.musical_role))
            event.version += 1
            event.updated_at = datetime.now(timezone.utc)
            _change(event, "event.member.joined", "aceitou o convite para participar")
        if event.band_id and not BandMember.query.filter_by(band_id=event.band_id, user_id=g.current_user.id).first():
            db.session.add(BandMember(band_id=event.band_id, user_id=g.current_user.id,
                                      access_role="member", musical_role=invitation.musical_role))
            band = db.session.get(Band, event.band_id)
            band.updated_at = datetime.now(timezone.utc)
        invitation.status = "accepted"
    else:
        invitation.status = "rejected"
    invitation.responded_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({"event": _serialize_event(event, g.current_user.id)} if action == "accept" else {"status": "rejected"})


@blueprint.post("/events/<event_id>/invitations")
@authenticated
def create_event_invitation(event_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    if g.auth_provider != "supabase":
        raise ApiError("login_necessario", "Entre com sua conta para enviar convites.", 403)
    payload = _json()
    name = _text(payload.get("name"), 120, "name", True)
    role = _text(payload.get("role"), 80, "role") or "Outra"
    if role.casefold() in {"líder", "lider", "liderança", "lideranca"}:
        raise ApiError("funcao_invalida", "A liderança é exclusiva do criador do evento.", 400)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    db.session.add(EventInvitation(
        id=str(uuid.uuid4()), event_id=event.id, token_hash=token_digest(token),
        invited_name=name, musical_role=role, created_by=g.current_user.id, expires_at=expires_at,
    ))
    db.session.commit()
    return jsonify({"token": token, "eventTitle": event.title, "name": name, "role": role, "expiresAt": _iso(expires_at)}), 201


@blueprint.post("/invitations/<token>/accept")
@authenticated
def accept_event_invitation(token: str):
    if g.auth_provider != "supabase":
        raise ApiError("login_necessario", "Entre com sua conta para aceitar o convite.", 403)
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        raise ApiError("convite_invalido", "O convite é inválido.", 400)
    invitation = EventInvitation.query.filter_by(token_hash=token_digest(token)).with_for_update().first()
    if invitation is None:
        raise ApiError("convite_invalido", "O convite não foi encontrado.", 404)
    if invitation.accepted_by and invitation.accepted_by != g.current_user.id:
        raise ApiError("convite_utilizado", "Este convite já foi usado.", 409)
    event = _event_or_404(invitation.event_id)
    if invitation.accepted_by == g.current_user.id:
        result = _serialize_event(event, g.current_user.id)
        db.session.commit()
        return jsonify(result), 200
    expiry = invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at
    if expiry < datetime.now(timezone.utc):
        raise ApiError("convite_expirado", "Este convite expirou. Peça um novo link ao líder.", 410)
    member = EventMember.query.filter_by(event_id=event.id, user_id=g.current_user.id).first()
    if member is None:
        db.session.add(EventMember(event_id=event.id, user_id=g.current_user.id,
                                   name=invitation.invited_name, role=invitation.musical_role,
                                   avatar_url=g.current_user.avatar_url))
    if event.band_id:
        band_member = BandMember.query.filter_by(band_id=event.band_id, user_id=g.current_user.id).first()
        if band_member is None:
            db.session.add(BandMember(band_id=event.band_id, user_id=g.current_user.id,
                                      access_role="member", musical_role=invitation.musical_role))
            band = db.session.get(Band, event.band_id)
            band.updated_at = datetime.now(timezone.utc)
    invitation.accepted_by = g.current_user.id
    invitation.accepted_at = datetime.now(timezone.utc)
    event.version += 1
    event.updated_at = datetime.now(timezone.utc)
    _change(event, "event.member.joined", "entrou no evento pelo convite")
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


@blueprint.patch("/events/<event_id>/repertoire/<item_id>/shared")
@authenticated
def update_shared_item(event_id: str, item_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    payload = _json()
    _expected_version(payload, event.version)
    item = db.session.get(EventRepertoireItem, item_id)
    if item is None or item.event_id != event.id:
        raise ApiError("item_nao_encontrado", "A música não pertence a este repertório.", 404)
    previous_key = item.shared_key
    item.shared_key = _text(payload.get("key"), 32, "key")
    item.shared_title = _text(payload.get("title"), 160, "title")
    item.shared_artist = _text(payload.get("artist"), 160, "artist")
    item.shared_capo = _text(payload.get("capo"), 20, "capo")
    item.shared_chord_sheet = _text(payload.get("chordSheet"), 100000, "chordSheet")
    item.shared_notes = _text(payload.get("notes"), 10000, "notes")
    if "songData" in payload:
        item.shared_song_data = _event_song_data(payload["songData"])
    event.version += 1
    event.updated_at = datetime.now(timezone.utc)
    if item.shared_key != previous_key:
        title = item.shared_title or "uma música"
        _change(event, "repertoire.key.updated", f"alterou o tom oficial de {title} de {previous_key or '—'} para {item.shared_key or '—'}")
    else:
        _change(event, "repertoire.song.updated", "alterou uma música do repertório compartilhado")
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


@blueprint.put("/events/<event_id>/repertoire/<item_id>/personal")
@authenticated
def update_personal_item(event_id: str, item_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    item = db.session.get(EventRepertoireItem, item_id)
    if item is None or item.event_id != event.id:
        raise ApiError("item_nao_encontrado", "A música não pertence a este repertório.", 404)
    payload = _json()
    override = PersonalRepertoireOverride.query.filter_by(repertoire_item_id=item.id, user_id=g.current_user.id).first()
    if override is None:
        override = PersonalRepertoireOverride(event_id=event.id, repertoire_item_id=item.id, user_id=g.current_user.id)
        db.session.add(override)
    override.personal_title = _text(payload.get("title"), 160, "title")
    override.personal_artist = _text(payload.get("artist"), 160, "artist")
    override.personal_key = _text(payload.get("key"), 32, "key")
    override.personal_capo = _text(payload.get("capo"), 20, "capo")
    override.personal_chord_sheet = _text(payload.get("chordSheet"), 100000, "chordSheet")
    override.personal_notes = _text(payload.get("notes"), 10000, "notes")
    if "songData" in payload:
        override.personal_song_data = _event_song_data(payload["songData"])
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


@blueprint.delete("/events/<event_id>/repertoire/<item_id>/personal")
@authenticated
def delete_personal_item(event_id: str, item_id: str):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    item = db.session.get(EventRepertoireItem, item_id)
    if item is None or item.event_id != event.id:
        raise ApiError("item_nao_encontrado", "A música não pertence a este repertório.", 404)
    override = PersonalRepertoireOverride.query.filter_by(event_id=event.id, repertoire_item_id=item_id, user_id=g.current_user.id).first()
    if override is not None:
        db.session.delete(override)
    db.session.commit()
    return jsonify(_serialize_event(event, g.current_user.id)), 200


@blueprint.delete("/events/<event_id>")
@authenticated
def delete_event(event_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    db.session.delete(event)
    db.session.commit()
    return "", 204
