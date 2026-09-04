from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..schemas.resumo_harmonico import ResumoHarmonicoRequest
from ..services.ia_service import IaService
from ..services.content_extractor import extract_uploads
from ..services.collaboration_auth import authenticated
from ..services.content_extractor import ExtractedContent
from ..services.music_sources import MusicSourceInvalid, MusicSourceTimeout, MusicSourceUnavailable


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
        extracted = extract_uploads(
            request.files.getlist("arquivo"),
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
    online_source = None
    if payload.tipo == "pesquisa":
        if not payload.sourceProvider or not payload.sourceId:
            raise ApiError("fonte_nao_selecionada", "Escolha uma fonte antes de gerar a música.", 400)
        try:
            online_source = current_app.extensions["music_source_registry"].fetch(payload.sourceProvider, payload.sourceId)
        except MusicSourceTimeout as error:
            raise ApiError("fonte_timeout", "A fonte demorou mais que o esperado.", 504) from error
        except MusicSourceUnavailable as error:
            raise ApiError("fonte_indisponivel", "A fonte musical está temporariamente indisponível.", 503) from error
        except MusicSourceInvalid as error:
            raise ApiError("fonte_invalida", "A fonte selecionada não pôde ser processada.", 422) from error
        extracted = ExtractedContent(
            "text", online_source.content, "text/plain",
            filename=None, size_bytes=len(online_source.content.encode("utf-8")),
        )
    service = IaService.from_config(current_app.config)
    result = service.generate(payload, extracted, request_id=g.get("request_id", ""), online_source=online_source)
    return jsonify(result.model_dump(mode="json")), 200
