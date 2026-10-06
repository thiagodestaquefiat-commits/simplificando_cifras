"""NLU público stateless, limitado por IP, sem acesso ao banco ou gravação de voz."""

from flask import Blueprint, jsonify, request
from voice_assistant.api import resolve_snapshot

from .. import limiter
from ..errors import ApiError

blueprint = Blueprint("assistant", __name__, url_prefix="/api/assistant")


@blueprint.post("/resolve")
@limiter.limit("30 per minute")
def resolve():
    if request.content_length and request.content_length > 32000:
        raise ApiError("entrada_invalida", "Comando muito grande.", 413)
    try:
        result = resolve_snapshot(request.get_json(silent=True))
    except ValueError as error:
        raise ApiError("entrada_invalida", str(error), 400) from None
    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store"
    return response
