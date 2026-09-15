from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..schemas.anthropic_song_analysis import AnthropicSongAnalysisRequest
from ..services.anthropic_song_analysis import AnthropicExperimentError, AnthropicSongAnalysisService
from ..services.collaboration_auth import authenticated


blueprint = Blueprint("anthropic_ai", __name__, url_prefix="/api/ai/anthropic")


def _rate_limit() -> str:
    return current_app.config["ANTHROPIC_AI_RATE_LIMIT"]


@blueprint.post("/song-analysis")
@limiter.limit(_rate_limit)
@authenticated
def song_analysis():
    if not current_app.config.get("ANTHROPIC_EXPERIMENT_ENABLED", False):
        raise ApiError("experimento_indisponivel", "Este experimento não está habilitado neste ambiente.", 404)
    if not request.is_json:
        raise ApiError("content_type_invalido", "Use application/json.", 415)
    raw_payload = request.get_json(silent=True)
    if not isinstance(raw_payload, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.", 400)
    payload = AnthropicSongAnalysisRequest.model_validate(raw_payload)
    try:
        result = AnthropicSongAnalysisService.from_config(current_app.config).analyze(
            payload.song,
            payload.artist,
            request_id=g.get("request_id", ""),
        )
    except AnthropicExperimentError as error:
        raise ApiError(error.code, error.public_message, error.status_code) from error
    return jsonify(result), 200
