from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..services.youtube_provider import YouTubeProvider, YouTubeProviderError


blueprint = Blueprint("youtube", __name__, url_prefix="/api/youtube")


def _provider() -> YouTubeProvider:
    return current_app.extensions["youtube_provider"]


@blueprint.get("/config")
@limiter.limit(lambda: current_app.config.get("YOUTUBE_CONFIG_RATE_LIMIT", "60 per minute"))
def youtube_config():
    response = jsonify({"provider": "youtube", "enabled": _provider().enabled})
    response.headers["Cache-Control"] = "public, max-age=300"
    return response, 200


@blueprint.get("/search")
@limiter.limit(lambda: current_app.config.get("YOUTUBE_SEARCH_RATE_LIMIT", "20 per minute"))
def search_youtube():
    query = " ".join(str(request.args.get("q") or "").split())
    if len(query) < 3:
        raise ApiError("busca_muito_curta", "Digite pelo menos 3 caracteres para pesquisar no YouTube.", 400)
    if len(query) > 200:
        raise ApiError("entrada_invalida", "A busca do YouTube excede 200 caracteres.", 400)
    try:
        limit = min(max(int(request.args.get("limit", "8")), 1), 10)
    except (TypeError, ValueError):
        raise ApiError("entrada_invalida", "Informe um limite de resultados válido.", 400) from None
    try:
        videos = _provider().search(query, limit)
    except YouTubeProviderError as error:
        raise ApiError("youtube_indisponivel", str(error), 503) from error
    return jsonify({"provider": "youtube", "videos": videos}), 200
