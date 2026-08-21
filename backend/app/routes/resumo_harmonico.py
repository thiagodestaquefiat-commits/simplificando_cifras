from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..schemas.resumo_harmonico import ResumoHarmonicoRequest
from ..services.ia_service import IaService


blueprint = Blueprint("resumo_harmonico", __name__, url_prefix="/api")


def _rate_limit() -> str:
    return current_app.config["RESUMO_RATE_LIMIT"]


@blueprint.post("/resumo-harmonico")
@limiter.limit(_rate_limit)
def resumo_harmonico():
    if not request.is_json:
        raise ApiError(
            "content_type_invalido",
            "Use Content-Type application/json nesta versão da API.",
            415,
        )

    raw_payload = request.get_json(silent=True)
    if not isinstance(raw_payload, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.", 400)

    payload = ResumoHarmonicoRequest.model_validate(
        raw_payload,
        context={"max_text_length": current_app.config["MAX_TEXT_LENGTH"]},
    )
    service = IaService.from_config(current_app.config)
    result = service.generate(payload)
    return jsonify(result.model_dump(mode="json")), 200
