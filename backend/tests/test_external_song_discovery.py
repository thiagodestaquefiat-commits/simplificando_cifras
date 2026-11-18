import json

import pytest

from app.services import web_search
from app.services.cifraclub_provider import CifraClubMusicSourceProvider
from app.services.music_sources import AuthorizedMusicSourceRegistry, MusicSourceInvalid, MusicSourceUnavailable
from test_api import auth_headers


DOCS = [
    {"txt": "Oceanos", "art": "Kemuel", "dns": "kemuel", "url": "oceanos", "tipo": "2"},
    {"txt": "Oceanos (Oceans)", "art": "Ana Nóbrega", "dns": "ana-nobrega", "url": "oceanos-oceans", "tipo": "2"},
    {"txt": "Outra música", "art": "Outra banda", "dns": "outra", "url": "outra-musica", "tipo": "2"},
    {"txt": "Oceanos", "art": "Artista", "dns": "artista", "url": "", "tipo": "1"},
    {"txt": "Oceanos", "art": "Inválido", "dns": "127.0.0.1", "url": "../../admin", "tipo": "2"},
]


@pytest.mark.parametrize("query,artist,expected", [
    ("Oceanos", None, ["Kemuel", "Ana Nóbrega"]),
    ("Oce", None, ["Kemuel", "Ana Nóbrega"]),
    ("Oceanos Ana Nóbrega", None, ["Ana Nóbrega"]),
    ("Oceanos", "Ana Nóbrega", ["Ana Nóbrega"]),
    ("Totalmente inexistente", None, []),
])
def test_discovery_returns_real_source_identities_without_loading_sheets(query, artist, expected):
    class NoSheetClient:
        def get_text(self, *args, **kwargs):
            pytest.fail("Search must not fetch chord sheets")

    provider = CifraClubMusicSourceProvider(http_client=NoSheetClient(), search_documents=lambda *args: DOCS)
    registry = AuthorizedMusicSourceRegistry([provider], url_validator=lambda url, hosts: url)
    candidates = registry.search(query, artist)
    assert [candidate.artist for candidate in candidates] == expected
    assert all(candidate.source_id in {"kemuel/oceanos", "ana-nobrega/oceanos-oceans"} for candidate in candidates)


def test_search_failure_is_not_reported_as_no_music():
    provider = CifraClubMusicSourceProvider(search_documents=lambda *args: None)
    with pytest.raises(MusicSourceUnavailable):
        provider.search("Oceanos")


@pytest.mark.parametrize("source_id", ["https://localhost/song", "../admin", "artist/song/extra", "artist/%2e%2e"])
def test_selected_source_cannot_inject_an_external_url(source_id):
    with pytest.raises(MusicSourceInvalid):
        CifraClubMusicSourceProvider().fetch(source_id)


def test_selected_candidate_resolves_through_existing_reader():
    class Client:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            assert allowed_hosts == web_search.CIFRACLUB_HOSTS
            assert url == "https://www.cifraclub.com.br/kemuel/oceanos/simplificada.html"
            return "<pre>[Intro] C G Am F\nC       G\nTexto de teste</pre>", url

    provider = CifraClubMusicSourceProvider(http_client=Client())
    registry = AuthorizedMusicSourceRegistry([provider], url_validator=lambda url, hosts: url)
    result = registry.fetch("cifraclub", "kemuel/oceanos")
    assert result.source_id == "kemuel/oceanos"
    assert "C G Am F" in result.content
    assert result.source_url.endswith("/simplificada.html")


def test_default_app_endpoint_discovers_songs_not_in_catalog(client, monkeypatch):
    class Response:
        status_code = 200
        text = json.dumps({"response": {"docs": DOCS}})

    calls = []
    def metadata_search(url, **kwargs):
        calls.append(url)
        return Response()

    monkeypatch.setattr(web_search.httpx, "get", metadata_search)
    registry = client.application.extensions["music_source_registry"]
    registry._url_validator = lambda url, hosts: url
    response = client.post("/api/music-sources/search", json={"titulo": "Oceanos"}, headers=auth_headers(client))
    assert response.status_code == 200
    candidates = response.get_json()["candidates"]
    assert {item["sourceId"] for item in candidates} == {"kemuel/oceanos", "ana-nobrega/oceanos-oceans"}
    assert all(item["providerId"] == "cifraclub" and "content" not in item for item in candidates)
    assert len(calls) == 1


def test_selected_web_source_keeps_existing_daily_quota(client, monkeypatch):
    from app.routes import resumo_harmonico
    monkeypatch.setattr(resumo_harmonico, "_user_web_quota", lambda limit: lambda user: False)
    def unexpected_fetch(*args):
        pytest.fail("Daily quota must be checked before downloading the sheet")
    monkeypatch.setattr(client.application.extensions["music_source_registry"], "fetch", unexpected_fetch)
    response = client.post("/api/resumo-harmonico", json={
        "tipo": "pesquisa", "titulo": "Oceanos", "sourceProvider": "cifraclub", "sourceId": "kemuel/oceanos",
    }, headers=auth_headers(client))
    assert response.status_code == 429
    assert response.get_json()["erro"]["codigo"] == "limite_busca_web"
