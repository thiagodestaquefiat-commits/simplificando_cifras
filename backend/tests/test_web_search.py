import pytest

from app.services import web_search
from app.services.music_sources import MusicSourceUnavailable


def fake_ddgs(results):
    class FakeDDGS:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def text(self, query, **kwargs):
            return results

    return FakeDDGS


class FakeHttpClient:
    def __init__(self, html=None, error=None):
        self.html, self.error, self.calls = html, error, []

    def get_text(self, url, *, allowed_hosts, allowed_content_types):
        self.calls.append((url, allowed_hosts, allowed_content_types))
        if self.error:
            raise self.error
        return self.html, url


RESULTS = [
    {"title": "Letra", "href": "https://www.letras.mus.br/artista/musica/", "body": "trecho da letra"},
    {"title": "Cifra Club", "href": "https://www.cifraclub.com.br/artista/musica/", "body": "G D Em C"},
    {"title": "Outra cifra", "href": "https://www.cifraclub.com.br/artista/outra/", "body": "A E"},
]


def test_fetches_first_cifraclub_result_and_uses_chord_sheet(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS))
    client = FakeHttpClient('<html><script>var x=1</script><div class="cifra_cnt"><pre><b>G</b>   D\nLetra da música</pre></div></html>')

    context = web_search.search_chord_context("Música", http_client=client)

    assert context == "G   D\nLetra da música"
    assert [call[0] for call in client.calls] == ["https://www.cifraclub.com.br/artista/musica/"]
    assert client.calls[0][1] == web_search.CIFRACLUB_HOSTS
    assert client.calls[0][2] == ("text/html",)


def test_chord_sheet_is_limited_to_20000_chars(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS))
    client = FakeHttpClient(f"<pre>{'G D ' * 6000}</pre>")

    assert len(web_search.search_chord_context("Música", http_client=client)) == 20000


@pytest.mark.parametrize("client", [
    FakeHttpClient(error=MusicSourceUnavailable("fora do ar")),
    FakeHttpClient("<html><p>sem cifra</p></html>"),
])
def test_falls_back_to_snippets_when_fetch_fails_or_has_no_chord_sheet(monkeypatch, client):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS))

    context = web_search.search_chord_context("Música", http_client=client)

    assert "- Cifra Club: G D Em C" in context
    assert context.count("- Cifra Club: G D Em C") == 2
    assert "- Letra: trecho da letra" in context


def test_does_not_fetch_without_cifraclub_result(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS[:1]))
    client = FakeHttpClient("<pre>G</pre>")

    assert web_search.search_chord_context("Música", http_client=client) == "- Letra: trecho da letra\n- Letra: trecho da letra"
    assert client.calls == []


@pytest.mark.parametrize("html, expected", [
    ('<div class="cifra">Am <span>F</span><br>ok</div>', "Am F\nok"),
    ('<div class="chord">C</div><p>fora</p>', "C"),
    ("<p>nada</p>", None),
])
def test_extract_chord_sheet_uses_cifra_or_chord_classes(html, expected):
    assert web_search.extract_chord_sheet(html) == expected


class RoutingHttpClient:
    def __init__(self, pages):
        self.pages, self.calls = pages, []

    def get_text(self, url, *, allowed_hosts, allowed_content_types):
        self.calls.append((url, allowed_hosts))
        page = self.pages[url]
        if isinstance(page, Exception):
            raise page
        return page, url


SIMPLIFICA_URL = "https://www.simplificacifras.com.br/artista/musica/"
PRIORITY_RESULTS = RESULTS + [{"title": "Simplifica", "href": SIMPLIFICA_URL, "body": "C G"}]


def test_queries_each_site_separately_without_or(monkeypatch):
    queries = []

    class CapturingDDGS(fake_ddgs([])):
        def text(self, query, **kwargs):
            queries.append(query)
            return []

    monkeypatch.setattr("duckduckgo_search.DDGS", CapturingDDGS)
    web_search.search_chord_context("Música", "Artista", http_client=FakeHttpClient(error=MusicSourceUnavailable("x")))

    assert queries == ["Música Artista cifra site:simplificacifras.com.br", "Música Artista cifra site:cifraclub.com.br"]
    assert all(" OR " not in query for query in queries)


def test_simplificacifras_is_fetched_before_cifraclub_even_if_ranked_lower(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(PRIORITY_RESULTS))
    client = RoutingHttpClient({SIMPLIFICA_URL: "<article>C   G\nLetra simplificada</article>"})

    assert web_search.search_chord_context("Música", http_client=client) == "C   G\nLetra simplificada"
    assert client.calls == [(SIMPLIFICA_URL, web_search.SIMPLIFICACIFRAS_HOSTS)]


def test_falls_back_to_cifraclub_when_simplificacifras_fails(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(PRIORITY_RESULTS))
    client = RoutingHttpClient({
        SIMPLIFICA_URL: MusicSourceUnavailable("fora do ar"),
        "https://www.cifraclub.com.br/artista/musica/": "<pre>G D</pre>",
    })

    assert web_search.search_chord_context("Música", http_client=client) == "G D"
    assert [call[0] for call in client.calls] == [SIMPLIFICA_URL, "https://www.cifraclub.com.br/artista/musica/"]


@pytest.mark.parametrize("texto, expected", [
    ("Legião Urbana", "legiao-urbana"),
    ("Pais e Filhos", "pais-e-filhos"),
    ("  Ação & Reação!! ", "acao-reacao"),
    (None, ""),
])
def test_slugify(texto, expected):
    assert web_search.slugify(texto) == expected


def test_extract_chord_sheet_tolerates_none():
    assert web_search.extract_chord_sheet(None) is None


SIMPLIFICA_DIRECT = "https://www.simplificacifras.com.br/cifras/artista/musica"
CIFRACLUB_DIRECT = "https://www.cifraclub.com.br/artista/musica/"


def test_direct_url_is_tried_before_duckduckgo(monkeypatch):
    queries = []

    class CapturingDDGS(fake_ddgs([])):
        def text(self, query, **kwargs):
            queries.append(query)
            return []

    monkeypatch.setattr("duckduckgo_search.DDGS", CapturingDDGS)
    client = RoutingHttpClient({SIMPLIFICA_DIRECT: "<article>C G\nLetra</article>"})

    hit = web_search.find_chord_sheet("Música", "Artista", http_client=client)

    assert hit == web_search.ChordSheetHit("C G\nLetra", SIMPLIFICA_DIRECT, "simplificacifras")
    assert client.calls == [(SIMPLIFICA_DIRECT, web_search.SIMPLIFICACIFRAS_HOSTS)]
    assert queries == []


def test_fallback_order_simplificacifras_cifraclub_then_duckduckgo(monkeypatch):
    queries = []
    ddg_simplifica = "https://www.simplificacifras.com.br/cifras/artista/musica-ao-vivo"

    class CapturingDDGS(fake_ddgs([])):
        def text(self, query, **kwargs):
            queries.append(query)
            return [{"title": "S", "href": ddg_simplifica, "body": ""}]

    monkeypatch.setattr("duckduckgo_search.DDGS", CapturingDDGS)
    client = RoutingHttpClient({
        SIMPLIFICA_DIRECT: MusicSourceUnavailable("404"),
        CIFRACLUB_DIRECT: "<html><p>sem cifra</p></html>",
        ddg_simplifica: "<pre>Am F</pre>",
    })

    hit = web_search.find_chord_sheet("Música", "Artista", http_client=client)

    assert hit == web_search.ChordSheetHit("Am F", ddg_simplifica, "simplificacifras")
    assert [call[0] for call in client.calls] == [SIMPLIFICA_DIRECT, CIFRACLUB_DIRECT, ddg_simplifica]
    assert queries == ["Música Artista cifra site:simplificacifras.com.br"]


def test_pais_e_filhos_comes_from_cifraclub_direct_without_duckduckgo(monkeypatch):
    class FailingDDGS:
        def __init__(self, *args, **kwargs):
            raise AssertionError("DuckDuckGo não deveria ser chamado")

    monkeypatch.setattr("duckduckgo_search.DDGS", FailingDDGS)
    cifraclub = "https://www.cifraclub.com.br/legiao-urbana/pais-e-filhos/"
    client = RoutingHttpClient({
        "https://www.simplificacifras.com.br/cifras/legiao-urbana/pais-e-filhos": MusicSourceUnavailable("404"),
        cifraclub: '<div class="cifra_cnt"><pre>C  G\nEstátuas e cofres</pre></div>',
    })

    hit = web_search.find_chord_sheet("Pais e Filhos", "Legião Urbana", http_client=client)

    assert hit == web_search.ChordSheetHit("C  G\nEstátuas e cofres", cifraclub, "cifraclub")


def test_find_chord_sheet_returns_none_when_nothing_found(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs([]))
    client = FakeHttpClient(error=MusicSourceUnavailable("x"))

    assert web_search.find_chord_sheet("Música", "Artista", http_client=client) is None


@pytest.mark.parametrize("html, expected", [
    ("<article><pre>G D</pre><p>comentários</p></article>", "G D"),
    ('<article><div class="cifra">Am F</div></article>', "Am F"),
    ("<article>C G<br>Letra</article>", "C G\nLetra"),
])
def test_simplificacifras_extraction_tries_pre_then_cifra_then_article(html, expected):
    assert web_search.extract_chord_sheet(html, include_article=True) == expected


def test_article_is_ignored_for_other_sources():
    assert web_search.extract_chord_sheet("<article>texto qualquer</article>") is None
