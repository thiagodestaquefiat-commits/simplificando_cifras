from __future__ import annotations

import logging
import re
import time
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
# Cifra Club primeiro: tem a cifra original do artista. O simplificacifras publica versões
# simplificadas e costuma não ter a música; fica como segunda opção.
PAGE_SOURCES = (
    ("cifraclub", CIFRACLUB_HOSTS, False),
    ("simplificacifras", SIMPLIFICACIFRAS_HOSTS, True),
)
SITE_DOMAINS = {"simplificacifras": "simplificacifras.com.br", "cifraclub": "cifraclub.com.br"}


@dataclass(frozen=True)
class ChordSheetHit:
    content: str
    url: str
    source_name: str
    key: str | None = None        # tom real da música (ex.: D)
    shape_key: str | None = None  # tom da forma dos acordes escritos (ex.: C em "D com forma de C")
    capo: int | None = None       # casa do capotraste


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.IGNORECASE | re.DOTALL)
_KEY_RE = re.compile(r"\bTom:\s*([A-G][#b]?m?)(?![\w#])(?:\s*\(\s*com forma de\s*([A-G][#b]?m?)(?![\w#])\s*\))?", re.IGNORECASE)
_CAPO_RE = re.compile(r"\bCapotraste\s*(?::|na)?\s*(\d{1,2})\s*[ªºa°]?\s*casa", re.IGNORECASE)


# O tom do Cifra Club é interativo (dá para transpor) e costuma vir em dados/atributos da página,
# não no texto; o capotraste vem no texto. Procura em JSON/atributos antes do texto visível.
_KEY_DATA_RES = (
    re.compile(r"""["'](?:tom|key|tone|songKey|originalKey|cifra_tom)["']\s*:\s*["']([A-G][#b]?m?)["']""", re.IGNORECASE),
    re.compile(r"""data-(?:tom|key|tone)\s*=\s*["']([A-G][#b]?m?)["']""", re.IGNORECASE),
)
_SHAPE_DATA_RE = re.compile(r"""["'](?:forma|shape|shapeKey|tomForma)["']\s*:\s*["']([A-G][#b]?m?)["']""", re.IGNORECASE)


def _key_name(value: str) -> str:
    return value[0].upper() + value[1:]


def extract_sheet_metadata(html: str | None) -> dict:
    """Lê 'Tom: D (com forma de C)' e 'Capotraste: 2ª casa' da página (fora do <pre>)."""
    if not html:
        return {}
    import html as html_lib
    text = html_lib.unescape(_TAG_RE.sub(" ", _SCRIPT_RE.sub(" ", html)))
    text = re.sub(r"\s+", " ", text)
    meta = {}
    key_match = _KEY_RE.search(text)
    if key_match:
        meta["key"] = _key_name(key_match.group(1))
        if key_match.group(2):
            meta["shape_key"] = _key_name(key_match.group(2))
    else:
        for pattern in _KEY_DATA_RES:
            data_match = pattern.search(html)
            if data_match:
                meta["key"] = _key_name(data_match.group(1))
                break
        shape_match = _SHAPE_DATA_RE.search(html)
        if shape_match:
            meta["shape_key"] = _key_name(shape_match.group(1))
    capo_match = _CAPO_RE.search(text)
    if capo_match and 0 < int(capo_match.group(1)) <= 12:
        meta["capo"] = int(capo_match.group(1))
    if "key" not in meta:
        # Diagnóstico: trecho em volta de "Tom" para ajustar o leitor se o HTML do site mudar.
        around = [html[max(0, m.start() - 120):m.end() + 160].replace("\n", " ")
                  for m in re.finditer(r"\btom\b", html, re.IGNORECASE)][:4]
        logger.warning("sheet_key_not_found capo=%s snippets=%r", meta.get("capo"), around)
    return meta


class ScraperApiHttpClient:
    """Cliente HTTP que roteia requisições pelo ScraperAPI para contornar bloqueios de IP de datacenter."""

    BASE_URL = "https://api.scraperapi.com/"
    SEARCH_URL = "https://api.scraperapi.com/structured/google/search"

    # A documentação do ScraperAPI recomenda 60-70s: ele tenta vários proxies antes de responder.
    # Com 20s a requisição era cortada antes do sucesso e a busca caía na IA.
    DEFAULT_TIMEOUT_SECONDS = 70.0
    supports_render = True

    def __init__(self, api_key: str, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS):
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._client = httpx.Client(timeout=timeout_seconds, follow_redirects=True)

    def get_text(self, url: str, *, allowed_hosts: tuple[str, ...], allowed_content_types=("text/html",),
                 render: bool = False, timeout_seconds: float | None = None) -> tuple[str, str]:
        # O Cifra Club entrega a cifra no HTML inicial (<pre>), então a primeira tentativa é sem
        # render (mais rápida e mais barata). render=true (JavaScript) fica como segunda tentativa.
        # country_code=br usa proxies brasileiros (melhor taxa de sucesso em sites .com.br).
        params = f"api_key={self._api_key}&url={quote_plus(url)}&country_code=br"
        if render:
            params += "&render=true&wait=3000"
        timeout = max(5.0, min(self._timeout_seconds, timeout_seconds or self._timeout_seconds))
        started = time.monotonic()
        try:
            response = self._client.get(f"{self.BASE_URL}?{params}", timeout=timeout)
        except httpx.TimeoutException as error:
            logger.warning("scraper_api_timeout url=%s render=%s after=%.1fs", url, render, time.monotonic() - started)
            raise MusicSourceTimeout("ScraperAPI timeout") from error
        except httpx.HTTPError as error:
            raise MusicSourceUnavailable("ScraperAPI indisponível") from error
        logger.info("scraper_api_response url=%s render=%s status=%d after=%.1fs",
                    url, render, response.status_code, time.monotonic() - started)
        if response.status_code == 403:
            raise MusicSourceUnavailable("ScraperAPI bloqueou a requisição (chave inválida ou sem créditos)")
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


RENDER_RETRY_MIN_SECONDS = 25


def _fetch_page(url: str, http_client, name: str, hosts: tuple[str, ...], include_article: bool,
                deadline: float | None = None) -> tuple[str | None, dict]:
    supports_render = getattr(http_client, "supports_render", False)
    attempts = (False, True) if supports_render else (False,)
    # Página carregou mas sem cifra (ex.: redirecionou para a página do artista): conta como "não achou".
    no_sheet = False
    for render in attempts:
        remaining = None if deadline is None else deadline - time.monotonic()
        if render and remaining is not None and remaining < RENDER_RETRY_MIN_SECONDS:
            logger.info("%s_render_retry_skipped url=%s remaining=%.1fs", name, url, remaining)
            return None, ({"not_found": True} if no_sheet else {})
        kwargs = {"render": render, "timeout_seconds": remaining} if supports_render else {}
        try:
            html, _final_url = http_client.get_text(url, allowed_hosts=hosts, allowed_content_types=("text/html",), **kwargs)
        except MusicSourceError as error:
            logger.warning("%s_fetch_failed=%s url=%s render=%s", name, error.__class__.__name__, url, render)
            if isinstance(error, (MusicSourceUnavailable,)) and "status 404" in str(error):
                return None, {"not_found": True}  # página não existe: não adianta renderizar
            continue
        sheet = extract_chord_sheet(html, include_article=include_article)
        if sheet:
            meta = extract_sheet_metadata(html)
            logger.info("%s_extract_ok url=%s render=%s sheet_len=%d meta=%s", name, url, render, len(sheet), meta)
            return sheet, meta
        preview = (html or "")[:300].replace("\n", " ")
        logger.warning("%s_extract_empty url=%s render=%s html_len=%d html_preview=%r", name, url, render, len(html or ""), preview)
        no_sheet = True
    return None, ({"not_found": True} if no_sheet else {})


_NON_SHEET_PATHS = ("/letra", "/imprimir", "/videoaulas", "/tabs", "/partitura", "/playlist")


def _candidate_urls(results, hosts: tuple[str, ...], titulo: str | None = None, limit: int = 2) -> list[str]:
    """URLs de cifra nos resultados, da mais provável para a menos provável.

    Descarta páginas que não têm cifra (letra, impressão, videoaula) e coloca primeiro a URL cujo
    slug da música é exatamente o título buscado, para não pegar um medley ("e-tudo-sobre-voce-ser-mudado")
    antes da música certa ("e-tudo-sobre-voce").
    """
    song_slug = slugify(titulo)
    ranked = []
    for index, item in enumerate(results):
        url = str(item.get("href") or "")
        parsed = urlparse(url)
        if (parsed.hostname or "").casefold() not in hosts:
            continue
        path = parsed.path.rstrip("/").casefold()
        if not path or any(marker in path for marker in _NON_SHEET_PATHS):
            continue
        segments = [segment for segment in path.split("/") if segment]
        if len(segments) < 2:  # página do artista, não da música
            continue
        last = segments[-1].removesuffix(".html")
        score = 0 if song_slug and last == song_slug else 1 if song_slug and song_slug in last else 2
        ranked.append((score, index, url))
    unique = list(dict.fromkeys(url for _score, _index, url in sorted(ranked)))
    return unique[:limit]


def _first_url(results, hosts: tuple[str, ...], titulo: str | None = None) -> str | None:
    urls = _candidate_urls(results, hosts, titulo, limit=1)
    return urls[0] if urls else None


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


_NON_SONG_SLUGS = {"discografia", "fotos", "videos", "letras", "musicas", "playlists"}
# Versões alternativas ficam por último: prefere a versão principal da música.
_VARIANT_WORDS = ("ao-vivo", "acustico", "playback", "instrumental", "versao", "medley", "remix", "live")


def _artist_song_url(titulo: str, artista: str, client, deadline: float | None = None) -> str | None:
    """URL da música na lista do artista no Cifra Club quando o nome dela tem complemento.

    Ex.: título "A Boa Parte" -> /nivea-soares/a-boa-parte-part-florianopolis-house-of-prayer/.
    Aceita só slug igual ao título ou que começa com "<título>-"; entre vários, prefere o que não é
    versão alternativa (ao vivo, acústico...) e depois o mais curto.
    """
    artist_slug, song_slug = slugify(artista), slugify(titulo)
    if not artist_slug or not song_slug:
        return None
    list_url = f"https://www.cifraclub.com.br/{artist_slug}/musicas.html"
    kwargs = {}
    if getattr(client, "supports_render", False):
        kwargs = {"render": False, "timeout_seconds": None if deadline is None else deadline - time.monotonic()}
    try:
        html, _final = client.get_text(list_url, allowed_hosts=CIFRACLUB_HOSTS, allowed_content_types=("text/html",), **kwargs)
    except Exception as error:  # noqa: BLE001 - a lista do artista é só uma tentativa extra
        logger.warning("cifraclub_artist_list_failed=%s url=%s", error.__class__.__name__, list_url)
        return None
    found = set(re.findall(rf"""href=["'](?:https?://(?:www\.)?cifraclub\.com\.br)?/{re.escape(artist_slug)}/([a-z0-9-]+)/?["'#?]""", html or ""))
    matches = [slug for slug in found if slug not in _NON_SONG_SLUGS and (slug == song_slug or slug.startswith(song_slug + "-"))]
    if not matches:
        logger.info("cifraclub_artist_list_no_match artist=%s song=%s songs=%d", artist_slug, song_slug, len(found))
        return None
    best = min(matches, key=lambda slug: (slug != song_slug, any(word in slug for word in _VARIANT_WORDS), len(slug), slug))
    logger.info("cifraclub_artist_list_match artist=%s song=%s match=%s", artist_slug, song_slug, best)
    return f"https://www.cifraclub.com.br/{artist_slug}/{best}/"


def _find(titulo: str, artista: str | None, http_client, search_fn=None,
          budget_seconds: float | None = None, allow_search: bool = True) -> tuple[ChordSheetHit | None, list]:
    client = http_client or SafeMusicSourceHttpClient(timeout_seconds=TIMEOUT_SECONDS)
    _search = search_fn or _ddg_search
    deadline = time.monotonic() + budget_seconds if budget_seconds else None

    def out_of_time(step: str) -> bool:
        if deadline is not None and time.monotonic() >= deadline:
            logger.warning("web_search_budget_exhausted step=%s budget=%ss", step, budget_seconds)
            return True
        return False

    cifraclub_missing = False
    for name, hosts, include_article in PAGE_SOURCES:
        if out_of_time(f"direct:{name}"):
            return None, []
        url = direct_url(name, titulo, artista)
        sheet, meta = _fetch_page(url, client, name, hosts, include_article, deadline) if url else (None, {})
        if sheet:
            return ChordSheetHit(sheet, url, name, **meta), []
        if name == "cifraclub" and meta.get("not_found"):
            cifraclub_missing = True

    # Endereço direto não existe (ex.: no Cifra Club a música é "a-boa-parte-part-florianopolis-house-of-prayer"):
    # abre UMA vez a lista de músicas do artista e procura a que começa com o título. Mais barato que a busca no Google.
    if artista and cifraclub_missing and not out_of_time("artist_list:cifraclub"):
        url = _artist_song_url(titulo, artista, client, deadline)
        if url and not out_of_time("artist_song:cifraclub"):
            sheet, meta = _fetch_page(url, client, "cifraclub", CIFRACLUB_HOSTS, False, deadline)
            if sheet:
                return ChordSheetHit(sheet, url, "cifraclub", **meta), []

    all_results = []
    if not allow_search:
        logger.info("web_search_skipped reason=search_fallback_disabled")
        return None, all_results
    for name, hosts, include_article in PAGE_SOURCES:
        if out_of_time(f"search:{name}"):
            break
        query = " ".join(part for part in (titulo, artista, "cifra", f"site:{SITE_DOMAINS[name]}") if part)
        results = _search(query)
        if results is None:
            continue
        all_results.extend(results)
        urls = [url for url in _candidate_urls(results, hosts, titulo) if url != direct_url(name, titulo, artista)]
        if not urls:
            logger.warning("%s_no_url_in_results query=%r", name, query)
            continue
        for url in urls:
            if out_of_time(f"fetch:{name}"):
                return None, all_results
            sheet, meta = _fetch_page(url, client, name, hosts, include_article, deadline)
            if sheet:
                return ChordSheetHit(sheet, url, name, **meta), all_results
    return None, all_results


def find_chord_sheet(titulo: str, artista: str | None = None, http_client=None, search_fn=None) -> ChordSheetHit | None:
    """Procura a cifra: URL direta do simplificacifras, URL direta do Cifra Club e depois busca por site."""
    return _find(titulo, artista, http_client, search_fn)[0]


def _snippets(results: list) -> str | None:
    snippets = []
    for item in results:
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()[:MAX_SNIPPET_CHARS]
        if title or body:
            snippets.append(f"- {title}: {body}")
    return "\n".join(snippets) or None


def search_chord_context(titulo: str, artista: str | None = None, http_client=None, search_fn=None) -> str | None:
    """Devolve a cifra encontrada por find_chord_sheet ou, se não houver, os trechos da busca.

    Falhas retornam None para não interromper a geração.
    """
    hit, results = _find(titulo, artista, http_client, search_fn)
    if hit:
        return hit.content
    return _snippets(results)


# Orçamento total da busca web por requisição. Somado ao DeepSeek (DEEPSEEK_TIMEOUT_SECONDS=90),
# precisa caber no timeout do gunicorn (180s no Dockerfile/Procfile).
WEB_SEARCH_BUDGET_SECONDS = 75


def make_web_searchers(scraper_api_key: str | None, *, http_client=None, search_fn=None,
                       budget_seconds: float | None = WEB_SEARCH_BUDGET_SECONDS, allow_search: bool = True):
    """Retorna (sheet_finder, chord_context_searcher) que compartilham UMA busca por música.

    Com SCRAPER_API_KEY, usa o ScraperAPI como proxy (contorna bloqueio de IP de datacenter no
    Railway). Sem chave, usa acesso direto + DuckDuckGo.

    Antes, quando sheet_finder não achava a cifra, o chord_context_searcher refazia exatamente as
    mesmas requisições (até 12 chamadas render=true ao ScraperAPI numa única busca). Agora o
    resultado de _find é memorizado por (título, artista) e reaproveitado pelas duas funções.
    """
    if http_client is None and scraper_api_key:
        client = ScraperApiHttpClient(scraper_api_key)
        http_client, search_fn = client, search_fn or client.google_search
    memo: dict[tuple[str, str | None], tuple[ChordSheetHit | None, list]] = {}

    def lookup(titulo: str, artista: str | None = None):
        key = (titulo, artista)
        if key not in memo:
            memo[key] = _find(titulo, artista, http_client, search_fn, budget_seconds=budget_seconds,
                              allow_search=allow_search)
            hit = memo[key][0]
            if hit:
                logger.info("chord_sheet_found source=%s url=%s chars=%d", hit.source_name, hit.url, len(hit.content))
            else:
                logger.warning("chord_sheet_not_found titulo=%r artista=%r search_results=%d",
                               titulo, artista, len(memo[key][1]))
        return memo[key]

    def sheet_finder(titulo: str, artista: str | None = None) -> ChordSheetHit | None:
        return lookup(titulo, artista)[0]

    def context_searcher(titulo: str, artista: str | None = None) -> str | None:
        hit, results = lookup(titulo, artista)
        return hit.content if hit else _snippets(results)

    return sheet_finder, context_searcher
