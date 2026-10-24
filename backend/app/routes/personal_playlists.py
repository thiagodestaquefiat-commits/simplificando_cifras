# MANUTENÇÃO: Playlists pessoais sincronizadas entre os aparelhos do dono (celular, PC...).
# MANUTENÇÃO: Cada item guarda só a referência da música da biblioteca (songClientId) e o tom/ajustes;
# MANUTENÇÃO: a música continua única na biblioteca. Só o dono lê e grava as próprias playlists.
# MANUTENÇÃO: Controle de versão otimista: quem grava manda a versão em que se baseou (baseVersion);
# MANUTENÇÃO: se outro aparelho gravou antes, responde 409 com a versão atual para o app decidir.
from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from .. import limiter
from ..database import db
from ..errors import ApiError
from ..models import PersonalPlaylist
from ..services.collaboration_auth import authenticated

blueprint = Blueprint("personal_playlists", __name__, url_prefix="/api/personal-playlists")

CLIENT_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
MAX_ITEMS = 1000
MAX_COVER = 1_500_000
MAX_BYTES = 3_000_000
NUMERIC_PLAYBACK = ("semitones", "capo", "bpm", "scrollSpeed", "fontSize", "tablatureFontSize")
PLAYBACK_FIELDS = set(NUMERIC_PLAYBACK) | {"meter", "instrument", "sheetView"}


def _now():
    return datetime.now(timezone.utc)


def _client_id(value):
    value = str(value or "")
    if not CLIENT_ID.fullmatch(value):
        raise ApiError("entrada_invalida", "Identificador da playlist inválido.", 400)
    return value


def _text(value, limit):
    return str(value or "").strip()[:limit]


def _clean(value):
    if not isinstance(value, dict):
        raise ApiError("playlist_invalida", "A playlist precisa ser um objeto válido.", 400)
    name = _text(value.get("name"), 120)
    if not name:
        raise ApiError("playlist_invalida", "Informe o nome da playlist.", 400)
    cover = value.get("coverImage")
    if cover is not None and (not isinstance(cover, str) or not cover.startswith("data:image/") or len(cover) > MAX_COVER):
        cover = None  # capa inválida ou grande demais não impede a sincronização
    items = value.get("items", [])
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise ApiError("playlist_invalida", f"Use até {MAX_ITEMS} músicas por playlist.", 400)
    cleaned, ids = [], set()
    for item in items:
        if not isinstance(item, dict):
            raise ApiError("playlist_invalida", "Item da playlist inválido.", 400)
        item_id = _text(item.get("id"), 160)
        if not item_id or item_id in ids:
            raise ApiError("playlist_invalida", "Identificadores de itens inválidos ou repetidos.", 400)
        ids.add(item_id)
        song_client_id = _text(item.get("songClientId"), 160)
        song_id = _text(item.get("songId"), 160)
        if not song_client_id and not song_id:
            raise ApiError("playlist_invalida", "Um item não aponta para nenhuma música.", 400)
        playback = item.get("playback") if isinstance(item.get("playback"), dict) else {}
        clean_playback = {}
        for key, number in playback.items():
            if key not in PLAYBACK_FIELDS:
                continue
            if key in NUMERIC_PLAYBACK and (isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number)):
                continue
            clean_playback[key] = number
        cleaned.append({
            "id": item_id,
            "songClientId": song_client_id,
            "songId": song_id,
            "title": _text(item.get("title"), 200),
            "artist": _text(item.get("artist"), 200),
            "playback": clean_playback,
            "notes": _text(item.get("notes"), 500),
        })
    data = {
        "name": name,
        "description": _text(value.get("description"), 300),
        "coverImage": cover,
        "pinned": bool(value.get("pinned")),
        "createdAt": _text(value.get("createdAt"), 40),
        "updatedAt": _text(value.get("updatedAt"), 40),
        "items": cleaned,
    }
    if len(json.dumps(data, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise ApiError("playlist_grande", "A playlist excede o limite permitido.", 413)
    return data


def _serialize(row):
    return {
        "clientId": row.client_id,
        "version": row.version,
        "deleted": bool(row.deleted),
        "data": row.playlist_data,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }


def _base_version(body):
    value = body.get("baseVersion")
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError("entrada_invalida", "baseVersion precisa ser um número inteiro.", 400)
    return value


def _conflict(row):
    response = jsonify({"erro": {"codigo": "versao_desatualizada", "mensagem": "A playlist mudou em outro aparelho."}, "playlist": _serialize(row)})
    response.status_code = 409
    return response


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.", 400)
    return body


@blueprint.get("")
@limiter.limit("240 per hour")
@authenticated
def list_playlists():
    rows = PersonalPlaylist.query.filter_by(owner_user_id=g.current_user.id).all()
    # Consulta periódica: se nada mudou desde a última leitura, não baixa as playlists de novo.
    fingerprint = sorted((row.client_id, row.version, bool(row.deleted)) for row in rows)
    cursor = hashlib.sha256(json.dumps(fingerprint).encode()).hexdigest()
    if request.args.get("since") == cursor:
        return jsonify({"unchanged": True, "cursor": cursor})
    return jsonify({"cursor": cursor, "playlists": [_serialize(row) for row in rows]})


@blueprint.put("/<client_id>")
@limiter.limit("600 per hour")
@authenticated
def save_playlist(client_id):
    client_id = _client_id(client_id)
    body = _body()
    data = _clean(body.get("data"))
    base = _base_version(body)
    row = PersonalPlaylist.query.filter_by(owner_user_id=g.current_user.id, client_id=client_id).first()
    if row is None:
        row = PersonalPlaylist(id=str(uuid.uuid4()), owner_user_id=g.current_user.id, client_id=client_id,
                               playlist_data=data, version=1, deleted=False, created_at=_now(), updated_at=_now())
        db.session.add(row)
        db.session.commit()
        return jsonify({"playlist": _serialize(row)}), 201
    if base != row.version and not body.get("force"):
        return _conflict(row)
    row.playlist_data = data
    row.deleted = False
    row.version = row.version + 1
    row.updated_at = _now()
    db.session.commit()
    return jsonify({"playlist": _serialize(row)})


@blueprint.delete("/<client_id>")
@limiter.limit("240 per hour")
@authenticated
def delete_playlist(client_id):
    client_id = _client_id(client_id)
    body = request.get_json(silent=True) if request.data else {}
    base = _base_version(body if isinstance(body, dict) else {})
    row = PersonalPlaylist.query.filter_by(owner_user_id=g.current_user.id, client_id=client_id).first()
    if row is None:
        return jsonify({"playlist": None})
    if row.deleted:
        return jsonify({"playlist": _serialize(row)})
    if base is not None and base != row.version:
        return _conflict(row)
    row.deleted = True
    row.version = row.version + 1
    row.updated_at = _now()
    db.session.commit()
    return jsonify({"playlist": _serialize(row)})
