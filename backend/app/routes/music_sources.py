from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..services.collaboration_auth import authenticated
from ..services.music_sources import MusicSourceTimeout, MusicSourceUnavailable


blueprint = Blueprint("music_sources", __name__, url_prefix="/api/music-sources")


def _rate_limit() -> str:
    return current_app.config["MUSIC_SOURCE_SEARCH_RATE_LIMIT"]


@blueprint.post("/search")
@limiter.limit(_rate_limit)
@authenticated
def search_music_sources():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("entrada_invalida", "Envie título e artista em JSON.", 400)
    title = str(payload.get("titulo") or "").strip()[:160]
    artist = str(payload.get("artista") or "").strip()[:160] or None
    if not title:
        raise ApiError("entrada_invalida", "Informe o título da música.", 400)
    registry = current_app.extensions["music_source_registry"]
    try:
        candidates = registry.search(title, artist)
    except MusicSourceTimeout as error:
        raise ApiError("fonte_timeout", "A busca nas fontes demorou mais que o esperado.", 504) from error
    except MusicSourceUnavailable as error:
        raise ApiError("fonte_indisponivel", "As fontes musicais estão temporariamente indisponíveis.", 503) from error
    return jsonify({"candidates": [{
        "providerId": item.provider_id,
        "sourceId": item.source_id,
        "sourceName": item.source_name,
        "sourceUrl": item.source_url,
        "title": item.title,
        "artist": item.artist,
        "format": item.format,
        "score": item.score,
    } for item in candidates]}), 200
