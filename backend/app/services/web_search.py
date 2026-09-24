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
SIMPLIFICACIFRAS_HOSTS = ("simplificacifras.com.br", "www.simplificacifras.com.br")
CIFRACLUB_HOSTS = ("cifraclub.com.br", "www.cifraclub.com.br")
CHORD_CLASSES = {"cifra", "chord"}
SKIPPED_TAGS = {"script", "style", "noscript"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _ChordSheetParser(HTMLParser):
    """Guarda o texto de cada <pre>, de cada elemento com class="cifra" ou class="chord" e de cada <article>."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pre_blocks: list[str] = []
        self.class_blocks: list[str] = []
        self.article_blocks: list[str] = []
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
        elif tag == "article":
            buffer = []
            self.article_blocks.append(buffer)
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
        for _tag, buffer in reversed(self._stack):
            if buffer is not None:
                buffer.append(text)
                return


def extract_chord_sheet(html: str, *, include_article: bool = False) -> str | None:
    parser = _ChordSheetParser()
    parser.feed(html)
    parser.close()
    candidates = (parser.pre_blocks, parser.class_blocks) + ((parser.article_blocks,) if include_article else ())
    for blocks in candidates:
        text = "\n".join("".join(block).strip("\n") for block in blocks if "".join(block).strip())
        if text.strip():
            return text.strip()[:MAX_PAGE_CHARS]
    return None


# Fontes de página em ordem de prioridade: (nome para log, hosts, aceita <article> como cifra).
PAGE_SOURCES = (
    ("simplificacifras", SIMPLIFICACIFRAS_HOSTS, True),
    ("cifraclub", CIFRACLUB_HOSTS, False),
)


def _fetch_page(url: str, http_client, name: str, hosts: tuple[str, ...], include_article: bool) -> str | None:
    try:
        html, _final_url = http_client.get_text(url, allowed_hosts=hosts, allowed_content_types=("text/html",))
    except MusicSourceError as error:
        logger.warning("%s_fetch_failed=%s", name, error.__class__.__name__)
        return None
    return extract_chord_sheet(html, include_article=include_article)


def _first_url(results, hosts: tuple[str, ...]) -> str | None:
    return next((str(item.get("href")) for item in results
                 if (urlparse(str(item.get("href") or "")).hostname or "").casefold() in hosts), None)


def search_chord_context(titulo: str, artista: str | None = None, http_client=None) -> str | None:
    """Busca no DuckDuckGo por cifra da música e devolve o conteúdo encontrado como texto.

    Baixa a página do primeiro resultado do simplificacifras.com.br (prioritário) ou do Cifra Club e usa
    o texto da cifra (até 3000 caracteres); se isso falhar, usa os trechos da busca. Falhas retornam None para não interromper a geração.
    """
    query = " ".join(part for part in (
        titulo, artista, "cifra", "site:simplificacifras.com.br OR site:cifraclub.com.br",
    ) if part)
    try:
        from duckduckgo_search import DDGS

        with DDGS(timeout=TIMEOUT_SECONDS) as ddgs:
            results = ddgs.text(query, region="br-pt", max_results=MAX_RESULTS) or []
    except Exception as error:  # noqa: BLE001 - a busca é opcional
        logger.warning("web_search_failed=%s", error.__class__.__name__)
        return None

    client = http_client or SafeMusicSourceHttpClient(timeout_seconds=TIMEOUT_SECONDS)
    for name, hosts, include_article in PAGE_SOURCES:
        url = _first_url(results, hosts)
        sheet = _fetch_page(url, client, name, hosts, include_article) if url else None
        if sheet:
            return sheet

    snippets = []
    for item in results:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()[:MAX_SNIPPET_CHARS]
        if title or body:
            snippets.append(f"- {title}: {body}")
    return "\n".join(snippets) or None
