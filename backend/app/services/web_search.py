from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

MAX_RESULTS = 5
MAX_SNIPPET_CHARS = 600
TIMEOUT_SECONDS = 8


def search_chord_context(titulo: str, artista: str | None = None) -> str | None:
    """Busca no DuckDuckGo por cifra da música e devolve os trechos encontrados como texto.

    Falhas de rede, bloqueio ou ausência de resultados retornam None para não interromper a geração.
    """
    query = " ".join(part for part in (
        titulo, artista, "cifra violão", "site:cifraclub.com.br OR site:letras.mus.br",
    ) if part)
    try:
        from duckduckgo_search import DDGS

        with DDGS(timeout=TIMEOUT_SECONDS) as ddgs:
            results = ddgs.text(query, region="br-pt", max_results=MAX_RESULTS) or []
    except Exception as error:  # noqa: BLE001 - a busca é opcional
        logger.warning("web_search_failed=%s", error.__class__.__name__)
        return None

    snippets = []
    for item in results:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()[:MAX_SNIPPET_CHARS]
        if title or body:
            snippets.append(f"- {title}: {body}")
    return "\n".join(snippets) or None
