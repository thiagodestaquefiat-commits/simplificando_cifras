"""Busca interna do Cifra Club: acha o endereço exato pelo nome e evita esperas longas."""
from app.services import web_search
from app.services.web_search import SiteSearchResult, _find, _pick_cifraclub_doc

SHEET_HTML = "<html><body><pre>[Intro] D  A\nD          A\nLetra da música aqui</pre></body></html>"

# Formato real devolvido por https://solr.sscdn.co/cc/c7/?q=na+sua+estante
DOCS = [
    {"art": "Pitty", "dns": "pitty", "txt": "Na Sua Estante", "url": "na-sua-estante", "tipo": "2"},
    {"art": "Jads & Jadson", "dns": "jads-e-jadson", "txt": "Na Sua Estante", "url": "na-sua-estante", "tipo": "2"},
    {"art": "Pitty", "dns": "pitty", "txt": "Pitty", "url": "", "tipo": "1"},
]


class PageClient:
    def __init__(self, pages):
        self.pages, self.requests = pages, []

    def get_text(self, url, *, allowed_hosts, allowed_content_types):
        self.requests.append(url)
        if url not in self.pages:
            raise web_search.MusicSourceUnavailable("404")
        return self.pages[url], url


def test_pick_uses_artist_when_given():
    assert _pick_cifraclub_doc(DOCS, "Na Sua Estante", "Jads & Jadson")["dns"] == "jads-e-jadson"


def test_pick_without_artist_takes_most_popular():
    assert _pick_cifraclub_doc(DOCS, "na sua estante", None)["dns"] == "pitty"


def test_pick_accepts_title_with_complement_and_prefers_main_version():
    docs = [{"dns": "x", "txt": "A Boa Parte (Ao Vivo)", "url": "a-boa-parte-ao-vivo", "tipo": "2"},
            {"dns": "x", "txt": "A Boa Parte (part. Fulano)", "url": "a-boa-parte-part-fulano", "tipo": "2"}]
    assert _pick_cifraclub_doc(docs, "A Boa Parte", "x")["url"] == "a-boa-parte-part-fulano"


def test_pick_rejects_other_song_or_artist():
    assert _pick_cifraclub_doc(DOCS, "Na Sua Estante", "Fernandinho") is None
    assert _pick_cifraclub_doc(DOCS, "Outra Música", None) is None


def test_find_goes_straight_to_the_page_found_by_site_search():
    url = "https://www.cifraclub.com.br/pitty/na-sua-estante/"
    client = PageClient({url: SHEET_HTML})
    hit, _ = _find("Na Sua Estante", None, client, search_fn=lambda q: [],
                   site_search=lambda t, a, c: SiteSearchResult(ok=True, url=url))
    assert hit and hit.url == url and "Letra da música" in hit.content
    assert client.requests == [url + "simplificada.html", url]  # simplificada não existe -> principal


def test_find_stops_early_when_cifraclub_confirms_song_does_not_exist():
    client, searches = PageClient({}), []
    hit, _ = _find("Xyzzy Inexistente", "Ninguém", client, search_fn=lambda q: searches.append(q) or [],
                   site_search=lambda t, a, c: SiteSearchResult(ok=True, url=None, missing=True))
    assert hit is None
    assert not any("cifraclub.com.br" in url for url in client.requests), "não tenta adivinhar endereço"
    assert searches == [], "não gasta busca no Google"


def test_find_falls_back_to_old_flow_when_site_search_fails():
    url = "https://www.cifraclub.com.br/pitty/na-sua-estante/"
    client = PageClient({url: SHEET_HTML})
    hit, _ = _find("Na Sua Estante", "Pitty", client, search_fn=lambda q: [],
                   site_search=lambda t, a, c: SiteSearchResult(ok=False))
    assert hit and hit.url == url


def test_hit_carries_artist_and_title_from_site_search():
    url = "https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/"
    client = PageClient({url: SHEET_HTML})
    hit, _ = _find("tempo perdido", None, client, search_fn=lambda q: [],
                   site_search=lambda t, a, c: SiteSearchResult(ok=True, url=url, artist="Legião Urbana", title="Tempo Perdido"))
    assert hit.artist == "Legião Urbana" and hit.title == "Tempo Perdido"


# Formato real de https://solr.sscdn.co/cc/c7/?q=oceanos+ana+nobrega
OCEANOS = [
    {"art": "Ana Nóbrega", "dns": "ana-nobrega", "txt": "Oceanos (Oceans)", "url": "oceanos-oceans", "tipo": "2"},
    {"art": "Kemuel", "dns": "kemuel", "txt": "Oceanos", "url": "oceanos", "tipo": "2"},
]


def test_pick_accepts_name_and_artist_typed_together():
    assert _pick_cifraclub_doc(OCEANOS, "Oceanos ana nobrega", None)["dns"] == "ana-nobrega"
    assert _pick_cifraclub_doc(OCEANOS, "Ana Nóbrega Oceanos", None)["dns"] == "ana-nobrega"
    assert _pick_cifraclub_doc(OCEANOS, "oceanos kemuel", None)["dns"] == "kemuel"


def test_pick_name_and_artist_together_still_rejects_other_song():
    assert _pick_cifraclub_doc(OCEANOS, "Outra ana nobrega", None) is None


def test_site_search_only_confirms_missing_when_nothing_is_related(monkeypatch):
    import json

    class Resp:
        status_code = 200

        def __init__(self, docs):
            self.text = json.dumps({"response": {"docs": docs}})

    monkeypatch.setattr(web_search.httpx, "get", lambda *a, **k: Resp(OCEANOS))
    related = web_search.cifraclub_site_search("Oceanos versao rara", None)
    assert related.ok and related.url is None and not related.missing
    monkeypatch.setattr(web_search.httpx, "get", lambda *a, **k: Resp(DOCS))
    unrelated = web_search.cifraclub_site_search("Xyzzy Inexistente", None)
    assert unrelated.ok and unrelated.missing


def test_find_keeps_trying_when_site_search_has_similar_songs_but_no_match():
    url = "https://www.cifraclub.com.br/pitty/na-sua-estante/"
    client = PageClient({url: SHEET_HTML})
    hit, _ = _find("Na Sua Estante", "Pitty", client, search_fn=lambda q: [],
                   site_search=lambda t, a, c: SiteSearchResult(ok=True, url=None, missing=False))
    assert hit and hit.url == url
