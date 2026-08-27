from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from ..database import db
from ..errors import ApiError
from ..models import (
    CollaborationUser,
    Band,
    BandMember,
    Event,
    EventChange,
    ExternalIdentity,
    EventMember,
    EventRepertoireItem,
    PersonalRepertoireOverride,
    UserAccessToken,
)
from ..services.collaboration_auth import authenticated, issue_access_token, token_digest


blueprint = Blueprint("events", __name__, url_prefix="/api/collaboration")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]{3,120}$")


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
                "chordSheet": item.shared_chord_sheet, "notes": item.shared_notes,
            },
            "personal": None if personal is None else {
                "title": personal.personal_title,
                "artist": personal.personal_artist,
                "key": personal.personal_key,
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
    missing = [item["id"] for item in members if db.session.get(CollaborationUser, item["id"]) is None]
    if missing:
        raise ApiError(
            "membro_nao_registrado",
            "Antes de sincronizar, informe o ID exibido no aplicativo de cada integrante.",
            400,
        )
    return members, leader_id


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


@blueprint.post("/users")
def register_user():
    payload = _json()
    user_id = _identifier(payload.get("id"), "id", f"user_{uuid.uuid4().hex}")
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
    )
    _assign_location(event, location_data)
    db.session.add(event)
    db.session.flush()
    _replace_members(event, members)
    _replace_repertoire(event, _repertoire_payload(payload))
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


@blueprint.put("/events/<event_id>")
@authenticated
def update_event(event_id: str):
    event = _event_or_404(event_id)
    _leader(event, g.current_user.id)
    payload = _json()
    _expected_version(payload, event.version)
    members, leader_id = _members_payload(payload, g.current_user)
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
    item.shared_key = _text(payload.get("key"), 32, "key")
    item.shared_title = _text(payload.get("title"), 160, "title")
    item.shared_artist = _text(payload.get("artist"), 160, "artist")
    item.shared_capo = _text(payload.get("capo"), 20, "capo")
    item.shared_chord_sheet = _text(payload.get("chordSheet"), 100000, "chordSheet")
    item.shared_notes = _text(payload.get("notes"), 10000, "notes")
    event.version += 1
    event.updated_at = datetime.now(timezone.utc)
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
