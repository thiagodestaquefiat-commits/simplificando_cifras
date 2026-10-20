# MANUTENÇÃO: Playlists compartilhadas por link. Guarda uma cópia fixa (snapshot) enviada por quem compartilha;
# MANUTENÇÃO: quem recebe só lê e salva na própria conta pelo app. Nada aqui altera bibliotecas ou eventos.
from __future__ import annotations

import json
import uuid

from flask import Blueprint, g, jsonify, request

from .. import limiter
from ..database import db
from ..errors import ApiError
from ..models import SharedPlaylist
from ..services.collaboration_auth import authenticated

blueprint = Blueprint("shared_playlists", __name__, url_prefix="/api/shared-playlists")
MAX_PLAYLIST_BYTES = 4_000_000
MAX_ITEMS = 200


def _clean_playlist(value):
    if not isinstance(value, dict):
        raise ApiError("playlist_invalida", "A playlist precisa ser um objeto válido.", 400)
    name = str(value.get("name") or "").strip()[:120]
    items = value.get("items")
    if not name:
        raise ApiError("nome_obrigatorio", "Dê um nome para a playlist.", 400)
    if not isinstance(items, list) or not items or len(items) > MAX_ITEMS:
        raise ApiError("playlist_invalida", f"A playlist precisa ter de 1 a {MAX_ITEMS} músicas.", 400)
    cleaned = []
    for item in items:
        song = item.get("song") if isinstance(item, dict) else None
        if not isinstance(song, dict) or not str(song.get("title") or "").strip():
            raise ApiError("playlist_invalida", "Há uma música sem título na playlist.", 400)
        playback = item.get("playback") if isinstance(item.get("playback"), dict) else {}
        cleaned.append({"song": song, "playback": playback, "notes": str(item.get("notes") or "")[:500]})
    data = {"name": name, "description": str(value.get("description") or "").strip()[:300], "items": cleaned}
    try:
        size = len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError) as error:
        raise ApiError("playlist_invalida", "A playlist contém dados inválidos.", 400) from error
    if size > MAX_PLAYLIST_BYTES:
        raise ApiError("playlist_muito_grande", "A playlist excede o limite permitido.", 413)
    return data


@blueprint.post("")
@limiter.limit("20 per hour")
@authenticated
def create_shared_playlist():
    data = _clean_playlist(request.get_json(silent=True))
    shared = SharedPlaylist(id=str(uuid.uuid4()), owner_user_id=g.current_user.id, playlist_data=data)
    db.session.add(shared)
    db.session.commit()
    return jsonify({"id": shared.id}), 201


@blueprint.get("/<playlist_id>")
@limiter.limit("60 per minute")
def get_shared_playlist(playlist_id):
    try:
        uuid.UUID(str(playlist_id))
    except ValueError as error:
        raise ApiError("nao_encontrado", "Playlist não encontrada.", 404) from error
    shared = db.session.get(SharedPlaylist, str(playlist_id))
    if shared is None:
        raise ApiError("nao_encontrado", "Playlist não encontrada.", 404)
    return jsonify({"id": shared.id, "playlist": shared.playlist_data, "createdAt": shared.created_at.isoformat()})
