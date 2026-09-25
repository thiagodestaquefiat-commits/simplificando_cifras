from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..services.collaboration_auth import authenticated
from ..services.shared_songs_service import SharedSongService

blueprint = Blueprint("shared_songs", __name__, url_prefix="/api/shared-songs")


def _rate_limit() -> str:
    return current_app.config.get("SHARED_SONG_SEARCH_RATE_LIMIT", "30 per minute")


@blueprint.get("/search")
@limiter.limit(_rate_limit)
@authenticated
def search_shared_songs():
    title = str(request.args.get("title") or "").strip()[:160]
    artist = str(request.args.get("artist") or "").strip()[:160] or None
    if not title:
        raise ApiError("entrada_invalida", "Informe o título da música.", 400)
    match = SharedSongService.search(title, artist)
    if match is None:
        return jsonify({"match": None}), 200
    song = match.song
    return jsonify({"match": {
        "id": song.id, "title": song.title, "artist": song.artist, "key": song.song_key, "capo": song.capo,
        "score": round(match.score, 4), "timesSearched": song.times_searched, "songData": song.song_data,
    }}), 200
