from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..schemas.resumo_harmonico import ResumoHarmonicoRequest
from ..services.ia_service import IaService
from ..services.content_extractor import extract_upload
from ..services.collaboration_auth import authenticated


blueprint = Blueprint("resumo_harmonico", __name__, url_prefix="/api")


def _rate_limit() -> str:
    return current_app.config["RESUMO_RATE_LIMIT"]


@blueprint.post("/resumo-harmonico")
@limiter.limit(_rate_limit)
@authenticated
def resumo_harmonico():
    extracted = None
    if request.mimetype == "multipart/form-data":
        raw_payload = {
            "tipo": "arquivo",
            "titulo": request.form.get("titulo"),
            "artista": request.form.get("artista"),
        }
        extracted = extract_upload(
            request.files.get("arquivo"),
            max_bytes=current_app.config["MAX_UPLOAD_SIZE"],
            max_pages=current_app.config["MAX_PDF_PAGES"],
            max_text_length=current_app.config["MAX_TEXT_LENGTH"],
        )
    elif request.is_json:
        raw_payload = request.get_json(silent=True)
    else:
        raise ApiError(
            "content_type_invalido",
            "Use JSON ou multipart/form-data.",
            415,
        )
    if not isinstance(raw_payload, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.", 400)

    payload = ResumoHarmonicoRequest.model_validate(
        raw_payload,
        context={"max_text_length": current_app.config["MAX_TEXT_LENGTH"]},
    )
    service = IaService.from_config(current_app.config)
    result = service.generate(payload, extracted, request_id=g.get("request_id", ""))
    return jsonify(result.model_dump(mode="json")), 200
