from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urlparse, quote_plus

import httpx

from .music_sources import MusicSourceError, MusicSourceTimeout, MusicSourceUnavailable, MusicSourceInvalid, SafeMusicSourceHttpClient

logger = logging.getLogger(__name__)

MAX_RESULTS = 5
MAX_SNIPPET_CHARS = 600
MAX_PAGE_CHARS = 20000
TIMEOUT_SECONDS = 8
SIMPLIFICACIFRAS_HOSTS = ("simplificacifras.com.br", "www.simplificacifras.com.br")
CIFRACLUB_HOSTS = ("cifraclub.com.br", "www.cifraclub.com.br")
CHORD_CLASSES = {"cifra", "chord", "cifra_mono", "g-song", "song-chords"}
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


def extract_chord_sheet(html: str | None, *, include_article: bool = False) -> str | None:
    if not html:
        return None
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
SITE_DOMAINS = {"simplificacifras": "simplificacifras.com.br", "cifraclub": "cifraclub.com.br"}


@dataclass(frozen=True)
class ChordSheetHit:
    content: str
    url: str
    source_name: str


class ScraperApiHttpClient:
    """Cliente HTTP que roteia requisições pelo ScraperAPI para contornar bloqueios de IP de datacenter."""

    BASE_URL = "https://api.scraperapi.com/"
    SEARCH_URL = "https://api.scraperapi.com/structured/google/search"

    def __init__(self, api_key: str, timeout_seconds: float = 20.0):
        self._api_key = api_key
        self._client = httpx.Client(timeout=timeout_seconds, follow_redirects=True)

    def get_text(self, url: str, *, allowed_hosts: tuple[str, ...], allowed_content_types=("text/html",)) -> tuple[str, str]:
        # render=true é necessário para SPAs (ex: Cifra Club em React) que carregam acordes via JS.
        # Custa 5 créditos/req no ScraperAPI em vez de 1, mas garante HTML completo.
        # render=true renderiza JavaScript (SPA React do Cifra Club).
        # country_code=br usa proxies residenciais brasileiros (melhor taxa de sucesso em sites .com.br).
        # wait=3000 aguarda 3s após o JS executar para o React terminar de montar os acordes no DOM.
        proxy_url = f"{self.BASE_URL}?api_key={self._api_key}&url={quote_plus(url)}&render=true&country_code=br&wait=3000"
        try:
            response = self._client.get(proxy_url)
        except httpx.TimeoutException as error:
            raise MusicSourceTimeout("ScraperAPI timeout") from error
        except httpx.HTTPError as error:
            raise MusicSourceUnavailable("ScraperAPI indisponível") from error
        if response.status_code == 403:
            raise MusicSourceUnavailable("ScraperAPI bloqueou a requisição")
        if response.status_code != 200:
            raise MusicSourceUnavailable(f"ScraperAPI retornou status {response.status_code}")
        content = response.content
        if len(content) > 1_500_000:
            raise MusicSourceInvalid("Conteúdo da fonte excede o limite")
        return content.decode(response.encoding or "utf-8", errors="replace"), url

    def google_search(self, query: str, max_results: int = 5) -> list | None:
        """Busca no Google via ScraperAPI, substituindo o DuckDuckGo bloqueado."""
        try:
            response = self._client.get(
                self.SEARCH_URL,
                params={"api_key": self._api_key, "query": query, "num": max_results, "country_code": "br"},
            )
            if response.status_code != 200:
                logger.warning("scraper_api_search_status=%d query=%r", response.status_code, query)
                return None
            data = response.json()
            results = [
                {"href": item.get("link"), "title": item.get("title"), "body": item.get("snippet")}
                for item in data.get("organic_results", [])
                if item.get("link")
            ]
            logger.info("scraper_api_search_results query=%r count=%d", query, len(results))
            return results
        except Exception as error:  # noqa: BLE001
            logger.warning("scraper_api_search_failed=%s", error.__class__.__name__)
            return None


def slugify(texto: str | None) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", sem_acento.casefold()).strip("-")


def direct_url(name: str, titulo: str, artista: str | None) -> str | None:
    artist_slug, song_slug = slugify(artista), slugify(titulo)
    if not artist_slug or not song_slug:
        return None
    if name == "simplificacifras":
        return f"https://www.simplificacifras.com.br/cifras/{artist_slug}/{song_slug}"
    return f"https://www.cifraclub.com.br/{artist_slug}/{song_slug}/"


def _fetch_page(url: str, http_client, name: str, hosts: tuple[str, ...], include_article: bool) -> str | None:
    try:
        html, _final_url = http_client.get_text(url, allowed_hosts=hosts, allowed_content_types=("text/html",))
    except MusicSourceError as error:
        logger.warning("%s_fetch_failed=%s url=%s", name, error.__class__.__name__, url)
        return None
    sheet = extract_chord_sheet(html, include_article=include_article)
    if not sheet:
        # Log primeiros 1000 chars do HTML para diagnóstico de extração falha
        preview = (html or "")[:1000].replace("\n", " ")
        logger.warning("%s_extract_empty url=%s html_len=%d html_preview=%r", name, url, len(html or ""), preview)
    else:
        logger.info("%s_extract_ok url=%s sheet_len=%d sheet_preview=%r", name, url, len(sheet), sheet[:200])
    return sheet


def _first_url(results, hosts: tuple[str, ...]) -> str | None:
    return next((str(item.get("href")) for item in results
                 if (urlparse(str(item.get("href") or "")).hostname or "").casefold() in hosts), None)


def _ddg_search(query: str) -> list | None:
    try:
        from duckduckgo_search import DDGS

        with DDGS(timeout=TIMEOUT_SECONDS) as ddgs:
            results = ddgs.text(query, region="br-pt", max_results=MAX_RESULTS) or []
    except Exception as error:  # noqa: BLE001 - a busca é opcional
        logger.warning("web_search_failed=%s", error.__class__.__name__)
        return None
    logger.info("web_search_results query=%r hosts=%s", query,
                [urlparse(str(item.get("href") or "")).hostname for item in results])
    return results


def _find(titulo: str, artista: str | None, http_client, search_fn=None) -> tuple[ChordSheetHit | None, list]:
    client = http_client or SafeMusicSourceHttpClient(timeout_seconds=TIMEOUT_SECONDS)
    _search = search_fn or _ddg_search
    for name, hosts, include_article in PAGE_SOURCES:
        url = direct_url(name, titulo, artista)
        sheet = _fetch_page(url, client, name, hosts, include_article) if url else None
        if sheet:
            return ChordSheetHit(sheet, url, name), []

    all_results = []
    for name, hosts, include_article in PAGE_SOURCES:
        query = " ".join(part for part in (titulo, artista, "cifra", f"site:{SITE_DOMAINS[name]}") if part)
        results = _search(query)
        if results is None:
            continue
        all_results.extend(results)
        url = _first_url(results, hosts)
        if not url:
            logger.warning("%s_no_url_in_results query=%r", name, query)
            continue
        sheet = _fetch_page(url, client, name, hosts, include_article)
        if sheet:
            return ChordSheetHit(sheet, url, name), all_results
    return None, all_results


def find_chord_sheet(titulo: str, artista: str | None = None, http_client=None, search_fn=None) -> ChordSheetHit | None:
    """Procura a cifra: URL direta do simplificacifras, URL direta do Cifra Club e depois busca por site."""
    return _find(titulo, artista, http_client, search_fn)[0]


def search_chord_context(titulo: str, artista: str | None = None, http_client=None, search_fn=None) -> str | None:
    """Devolve a cifra encontrada por find_chord_sheet ou, se não houver, os trechos da busca.

    Falhas retornam None para não interromper a geração.
    """
    hit, results = _find(titulo, artista, http_client, search_fn)
    if hit:
        return hit.content
    snippets = []
    for item in results:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()[:MAX_SNIPPET_CHARS]
        if title or body:
            snippets.append(f"- {title}: {body}")
    return "\n".join(snippets) or None


def make_web_searchers(scraper_api_key: str):
    """Retorna (sheet_finder, chord_context_searcher) usando ScraperAPI como proxy.

    Uso: quando SCRAPER_API_KEY está configurado no Railway para contornar
    bloqueio de IPs de datacenter no DuckDuckGo e nas fontes de cifras.
    """
    import functools
    client = ScraperApiHttpClient(scraper_api_key)
    search_fn = client.google_search
    return (
        functools.partial(find_chord_sheet, http_client=client, search_fn=search_fn),
        functools.partial(search_chord_context, http_client=client, search_fn=search_fn),
    )
