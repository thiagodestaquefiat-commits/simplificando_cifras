from __future__ import annotations

import logging
from html.parser import HTMLParser
from urllib.parse import urlparse

from .music_sources import MusicSourceError, SafeMusicSourceHttpClient

logger = logging.getLogger(__name__)

MAX_RESULTS = 5
MAX_SNIPPET_CHARS = 600
MAX_PAGE_CHARS = 3000
TIMEOUT_SECONDS = 8
CIFRACLUB_HOSTS = ("cifraclub.com.br", "www.cifraclub.com.br")
CHORD_CLASSES = {"cifra", "chord"}
SKIPPED_TAGS = {"script", "style", "noscript"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _ChordSheetParser(HTMLParser):
    """Guarda o texto de cada <pre> e de cada elemento com class="cifra" ou class="chord"."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pre_blocks: list[str] = []
        self.class_blocks: list[str] = []
        self._stack: list[tuple[str, list[str] | None]] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in VOID_TAGS:
            if tag == "br":
                self._write("\n")
            return
        if tag in SKIPPED_TAGS:
            self._skip_depth += 1
        classes = set((dict(attrs).get("class") or "").split())
        buffer = None
        if tag == "pre":
            buffer = []
            self.pre_blocks.append(buffer)
        elif classes & CHORD_CLASSES:
            buffer = []
            self.class_blocks.append(buffer)
        self._stack.append((tag, buffer))

    def handle_endtag(self, tag):
        if tag in SKIPPED_TAGS and self._skip_depth:
            self._skip_depth -= 1
        for index in range(len(self._stack) - 1, -1, -1):
            if self._stack[index][0] == tag:
                del self._stack[index:]
                break

    def handle_data(self, data):
        if not self._skip_depth:
            self._write(data)

    def _write(self, text):
        for _tag, buffer in self._stack:
            if buffer is not None:
                buffer.append(text)
                return


def extract_chord_sheet(html: str) -> str | None:
    parser = _ChordSheetParser()
    parser.feed(html)
    parser.close()
    for blocks in (parser.pre_blocks, parser.class_blocks):
        text = "\n".join("".join(block).strip("\n") for block in blocks if "".join(block).strip())
        if text.strip():
            return text.strip()[:MAX_PAGE_CHARS]
    return None


def _fetch_cifraclub(url: str, http_client) -> str | None:
    try:
        html, _final_url = http_client.get_text(url, allowed_hosts=CIFRACLUB_HOSTS, allowed_content_types=("text/html",))
    except MusicSourceError as error:
        logger.warning("cifraclub_fetch_failed=%s", error.__class__.__name__)
        return None
    return extract_chord_sheet(html)


def search_chord_context(titulo: str, artista: str | None = None, http_client=None) -> str | None:
    """Busca no DuckDuckGo por cifra da música e devolve o conteúdo encontrado como texto.

    Quando há resultado do Cifra Club, baixa a página e usa o texto da cifra (até 3000 caracteres);
    se isso falhar, usa os trechos da busca. Falhas retornam None para não interromper a geração.
    """
    query = " ".join(part for part in (
        titulo, artista, "cifra violão simplificada", "site:cifraclub.com.br OR site:letras.mus.br",
    ) if part)
    try:
        from duckduckgo_search import DDGS

        with DDGS(timeout=TIMEOUT_SECONDS) as ddgs:
            results = ddgs.text(query, region="br-pt", max_results=MAX_RESULTS) or []
    except Exception as error:  # noqa: BLE001 - a busca é opcional
        logger.warning("web_search_failed=%s", error.__class__.__name__)
        return None

    cifraclub_url = next((str(item.get("href")) for item in results
                          if (urlparse(str(item.get("href") or "")).hostname or "").casefold() in CIFRACLUB_HOSTS), None)
    if cifraclub_url:
        sheet = _fetch_cifraclub(cifraclub_url, http_client or SafeMusicSourceHttpClient(timeout_seconds=TIMEOUT_SECONDS))
        if sheet:
            return sheet

    snippets = []
    for item in results:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()[:MAX_SNIPPET_CHARS]
        if title or body:
            snippets.append(f"- {title}: {body}")
    return "\n".join(snippets) or None
