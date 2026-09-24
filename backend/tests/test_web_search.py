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

    context = web_search.search_chord_context("Música", "Artista", http_client=client)

    assert context == "G   D\nLetra da música"
    assert [call[0] for call in client.calls] == ["https://www.cifraclub.com.br/artista/musica/"]
    assert client.calls[0][1] == web_search.CIFRACLUB_HOSTS
    assert client.calls[0][2] == ("text/html",)


def test_chord_sheet_is_limited_to_3000_chars(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS))
    client = FakeHttpClient(f"<pre>{'G D ' * 2000}</pre>")

    assert len(web_search.search_chord_context("Música", http_client=client)) == 3000


@pytest.mark.parametrize("client", [
    FakeHttpClient(error=MusicSourceUnavailable("fora do ar")),
    FakeHttpClient("<html><p>sem cifra</p></html>"),
])
def test_falls_back_to_snippets_when_fetch_fails_or_has_no_chord_sheet(monkeypatch, client):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS))

    context = web_search.search_chord_context("Música", http_client=client)

    assert "- Cifra Club: G D Em C" in context
    assert "- Letra: trecho da letra" in context


def test_does_not_fetch_without_cifraclub_result(monkeypatch):
    monkeypatch.setattr("duckduckgo_search.DDGS", fake_ddgs(RESULTS[:1]))
    client = FakeHttpClient("<pre>G</pre>")

    assert web_search.search_chord_context("Música", http_client=client) == "- Letra: trecho da letra"
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


def test_query_prioritizes_simplificacifras_then_cifraclub(monkeypatch):
    queries = []

    class CapturingDDGS(fake_ddgs([])):
        def text(self, query, **kwargs):
            queries.append(query)
            return []

    monkeypatch.setattr("duckduckgo_search.DDGS", CapturingDDGS)
    web_search.search_chord_context("Música", "Artista", http_client=FakeHttpClient())

    assert queries == ["Música Artista cifra site:simplificacifras.com.br OR site:cifraclub.com.br"]


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


@pytest.mark.parametrize("html, expected", [
    ("<article><pre>G D</pre><p>comentários</p></article>", "G D"),
    ('<article><div class="cifra">Am F</div></article>', "Am F"),
    ("<article>C G<br>Letra</article>", "C G\nLetra"),
])
def test_simplificacifras_extraction_tries_pre_then_cifra_then_article(html, expected):
    assert web_search.extract_chord_sheet(html, include_article=True) == expected


def test_article_is_ignored_for_other_sources():
    assert web_search.extract_chord_sheet("<article>texto qualquer</article>") is None
