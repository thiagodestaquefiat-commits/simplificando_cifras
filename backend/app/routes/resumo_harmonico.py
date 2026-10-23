# MANUTENÇÃO: Entrada autenticada de geração por texto, pesquisa ou multipart de arquivos.
# MANUTENÇÃO: Valida formato/limites, extrai conteúdo e encaminha ao serviço; não confiar apenas no frontend.
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
        if payload.modoGeracao != "conhecimento_modelo" and (not payload.sourceProvider or not payload.sourceId):
            raise ApiError("fonte_nao_selecionada", "Escolha uma fonte antes de gerar a música.", 400)
        if payload.sourceProvider and payload.sourceId:
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
    result = service.generate(payload, extracted, request_id=g.get("request_id", ""), online_source=online_source,
                            user_id=g.current_user.id)
    return jsonify(result.model_dump(mode="json")), 200


_MAX_ORGANIZE_SONGS = 60


def _organize_one(raw: dict) -> dict:
    """Remonta o resumo de uma música da biblioteca no padrão ROUDY (sem IA, sem ScraperAPI)."""
    from ..schemas.resumo_harmonico import ResumoHarmonicoResponse
    from ..services.harmonic_normalizer import ensure_client_chords
    from ..services.ia_service import roudy_summary, summary_off_standard

    song_id = str(raw.get("id") or "")[:160]
    blocks = [
        {"acordes": [str(chord)[:40] for chord in (block.get("acordes") or [])][:64],
         "repeticoes": block.get("repeticoes") if isinstance(block.get("repeticoes"), int) and 1 <= block.get("repeticoes") <= 99 else None,
         "fraseGuia": (str(block.get("fraseGuia") or "").strip()[:80] or None)}
        for block in (raw.get("blocos") or [])[:80] if isinstance(block, dict)
    ]
    content = str(raw.get("letraCifra") or "")[:50000]
    original = ResumoHarmonicoResponse.model_validate({
        "titulo": str(raw.get("titulo") or "Música")[:160] or "Música",
        "artista": (str(raw.get("artista") or "")[:160] or None),
        "tom": (str(raw.get("tom") or "")[:20] or None),
        "confianca": "media",
        "harmonicSummary": {"blocos": [block for block in blocks if block["acordes"]]},
        "fullChordSheet": {"source": "user_text", "content": content} if content.strip() else None,
    })
    if not summary_off_standard(original):
        return {"id": song_id, "changed": False, "motivo": "ja_no_padrao"}
    fixed = ensure_client_chords(roudy_summary(original))
    before = [(b.acordes, b.repeticoes, b.fraseGuia) for b in original.harmonicSummary.blocos]
    after = [(b.acordes, b.repeticoes, b.fraseGuia) for b in fixed.harmonicSummary.blocos]
    if not after or after == before:
        return {"id": song_id, "changed": False, "motivo": "sem_letra_cifra" if not content.strip() else "nao_foi_possivel"}
    return {"id": song_id, "changed": True,
            "blocos": [{"acordes": b.acordes, "repeticoes": b.repeticoes, "fraseGuia": b.fraseGuia} for b in fixed.harmonicSummary.blocos]}


@blueprint.post("/resumo-harmonico/organizar")
@limiter.limit(_rate_limit)
@authenticated
def organizar_resumos():
    """Organiza resumos da biblioteca do próprio usuário no padrão ROUDY.

    O app manda as músicas e recebe o resumo novo só das que mudaram; quem salva é o app, depois
    que o usuário confere. Não usa IA nem ScraperAPI, não conta no limite de buscas e não grava nada aqui.
    """
    payload = request.get_json(silent=True)
    songs = payload.get("musicas") if isinstance(payload, dict) else None
    if not isinstance(songs, list) or not songs:
        raise ApiError("entrada_invalida", "Envie a lista de músicas.", 400)
    if len(songs) > _MAX_ORGANIZE_SONGS:
        raise ApiError("entrada_invalida", f"Envie no máximo {_MAX_ORGANIZE_SONGS} músicas por vez.", 400)
    results = []
    for raw in songs:
        if not isinstance(raw, dict):
            continue
        try:
            results.append(_organize_one(raw))
        except Exception:  # noqa: BLE001 - uma música com dado estranho não derruba as outras
            current_app.logger.warning("organizar_resumo_falhou id=%r", str(raw.get("id"))[:160], exc_info=True)
            results.append({"id": str(raw.get("id") or "")[:160], "changed": False, "motivo": "erro"})
    current_app.logger.info("organizar_resumos total=%d mudaram=%d", len(results), sum(1 for item in results if item["changed"]))
    return jsonify({"resultados": results}), 200
