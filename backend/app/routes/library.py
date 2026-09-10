from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from ..database import db
from ..errors import ApiError
from ..models import PersonalSong
from ..services.collaboration_auth import authenticated

blueprint = Blueprint("library", __name__, url_prefix="/api/library/songs")
MAX_ITEMS = 500
MAX_SONG_BYTES = 750_000


def _payload(value):
    if not isinstance(value, dict):
        raise ApiError("musica_invalida", "A música precisa ser um objeto válido.", 400)
    try:
        size = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError) as error:
        raise ApiError("musica_invalida", "A música contém dados inválidos.", 400) from error
    if size > MAX_SONG_BYTES:
        raise ApiError("musica_muito_grande", "A música excede o limite permitido.", 413)
    if not str(value.get("title") or "").strip():
        raise ApiError("titulo_obrigatorio", "A música precisa de um título.", 400)
    return value


def _client_id(value):
    result = str(value or "").strip()
    if not result or len(result) > 160:
        raise ApiError("client_id_invalido", "O identificador local da música é inválido.", 400)
    return result


def _serialize(song):
    return {"id": song.id, "clientId": song.client_id, "songData": song.song_data,
            "version": song.version, "updatedAt": song.updated_at.isoformat(), "deletedAt": song.deleted_at.isoformat() if song.deleted_at else None}


def _upsert(client_id, song_data, expected_version=None):
    song = PersonalSong.query.filter_by(owner_user_id=g.current_user.id, client_id=client_id).first()
    if song and expected_version is not None:
        try:
            matches = int(expected_version) == song.version
        except (TypeError, ValueError):
            matches = False
        if not matches:
            raise ApiError("conflito_versao", "Existe uma versão mais recente desta música.", 409)
    if song is None:
        song = PersonalSong(id=str(uuid.uuid4()), owner_user_id=g.current_user.id, client_id=client_id,
                            song_data=song_data, version=1)
        db.session.add(song)
        return song, "created"
    if song.song_data == song_data and song.deleted_at is None:
        return song, "existing"
    song.song_data, song.deleted_at, song.version = song_data, None, song.version + 1
    song.updated_at = datetime.now(timezone.utc)
    return song, "updated"


@blueprint.get("")
@authenticated
def list_songs():
    values = PersonalSong.query.filter_by(owner_user_id=g.current_user.id, deleted_at=None).order_by(PersonalSong.updated_at).all()
    db.session.commit()
    return jsonify({"songs": [_serialize(song) for song in values]}), 200


@blueprint.get("/diagnostics")
@authenticated
def library_diagnostics():
    values = PersonalSong.query.filter_by(owner_user_id=g.current_user.id).order_by(PersonalSong.created_at).all()
    records = [{
        "id": song.id,
        "clientId": song.client_id,
        "localSongId": song.song_data.get("id") if isinstance(song.song_data, dict) else None,
        "title": song.song_data.get("title") if isinstance(song.song_data, dict) else None,
        "artist": song.song_data.get("artist") if isinstance(song.song_data, dict) else None,
        "version": song.version,
        "createdAt": song.created_at.isoformat(),
        "updatedAt": song.updated_at.isoformat(),
        "deletedAt": song.deleted_at.isoformat() if song.deleted_at else None,
    } for song in values]
    return jsonify({
        "active": sum(1 for song in values if song.deleted_at is None),
        "deleted": sum(1 for song in values if song.deleted_at is not None),
        "records": records,
    }), 200


@blueprint.put("/<path:client_id>")
@authenticated
def put_song(client_id):
    body = request.get_json(silent=True) or {}
    song, outcome = _upsert(_client_id(client_id), _payload(body.get("songData")), body.get("expectedVersion"))
    db.session.commit()
    return jsonify({"outcome": outcome, "song": _serialize(song)}), 200 if outcome != "created" else 201


@blueprint.post("/sync")
@authenticated
def sync_songs():
    body = request.get_json(silent=True) or {}
    items = body.get("items")
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise ApiError("lote_invalido", "Envie uma lista com no máximo 500 músicas.", 400)
    results = []
    for item in items:
        client_id = str(item.get("clientId") or "") if isinstance(item, dict) else ""
        try:
            if not isinstance(item, dict):
                raise ApiError("musica_invalida", "A música precisa ser um objeto válido.", 400)
            with db.session.begin_nested():
                song, outcome = _upsert(_client_id(client_id), _payload(item.get("songData")), item.get("expectedVersion"))
                db.session.flush()
                results.append({"clientId": client_id, "outcome": outcome, "song": _serialize(song)})
        except ApiError as error:
            results.append({"clientId": client_id, "outcome": "failed", "error": error.code})
    db.session.commit()
    return jsonify({"results": results}), 200


@blueprint.delete("/<path:client_id>")
@authenticated
def delete_song(client_id):
    song = PersonalSong.query.filter_by(owner_user_id=g.current_user.id, client_id=_client_id(client_id)).first()
    if song is None or song.deleted_at is not None:
        return "", 204
    song.deleted_at, song.version = datetime.now(timezone.utc), song.version + 1
    db.session.commit()
    return "", 204
