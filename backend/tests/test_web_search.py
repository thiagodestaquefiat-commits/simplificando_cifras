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
