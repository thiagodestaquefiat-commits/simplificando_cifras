"""TEMPORÁRIO (força-tarefa out/2026): organiza o resumo das músicas do catálogo compartilhado no
padrão ROUDY (frase-guia + uma volta dos acordes + repetições). Remover junto com as rotas
/api/shared-songs/admin/organizar quando o catálogo estiver todo no padrão.

Remonta só o resumo, pela Letra + Cifras que a própria música do catálogo já tem (sem IA, sem
ScraperAPI). Título, artista, tom, capo e Letra + Cifras ficam como estão.
"""
from __future__ import annotations

import logging

from ..schemas.resumo_harmonico import ResumoHarmonicoResponse
from .harmonic_normalizer import ensure_client_chords
from .ia_service import roudy_summary, summary_off_standard

logger = logging.getLogger(__name__)


def _blocks(result: ResumoHarmonicoResponse) -> list[dict]:
    return [{"acordes": list(block.acordes), "repeticoes": block.repeticoes, "fraseGuia": block.fraseGuia}
            for block in result.harmonicSummary.blocos]


def plan(song) -> dict:
    """O que aconteceria com esta música do catálogo (não grava nada).

    status: "organizar" (com antes/depois), "ja_no_padrao", "sem_letra_cifra" (precisa completar a
    cifra antes) ou "erro" (dado salvo que nem abre).
    """
    item = {"id": song.id, "title": song.title, "artist": song.artist}
    try:
        current = ResumoHarmonicoResponse.model_validate(song.song_data)
    except Exception:  # noqa: BLE001 - dado antigo/estranho: só reporta
        logger.warning("catalog_organizer_invalid id=%s", song.id, exc_info=True)
        return {**item, "status": "erro"}
    if not summary_off_standard(current):
        return {**item, "status": "ja_no_padrao"}
    has_sheet = bool(current.fullChordSheet and (current.fullChordSheet.content or "").strip())
    fixed = ensure_client_chords(roudy_summary(current))
    before, after = _blocks(current), _blocks(fixed)
    if not after or after == before or not any(block["fraseGuia"] for block in after) and has_sheet:
        return {**item, "status": "sem_letra_cifra" if not has_sheet else "nao_foi_possivel"}
    return {**item, "status": "organizar", "antes": before, "depois": after}


def apply(song) -> dict | None:
    """Grava o resumo novo na música do catálogo; devolve antes/depois ou None se não mudou."""
    result = plan(song)
    if result["status"] != "organizar":
        return None
    data = dict(song.song_data)
    data["harmonicSummary"] = {"blocos": result["depois"]}
    ResumoHarmonicoResponse.model_validate(data)  # nunca grava algo que o app não consiga ler
    song.song_data = data
    logger.info("catalog_organizer_applied id=%s titulo=%r blocos=%d->%d", song.id, song.title,
                len(result["antes"]), len(result["depois"]))
    return result
