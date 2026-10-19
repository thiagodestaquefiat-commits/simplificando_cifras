from urllib.parse import parse_qs, urlparse

from app.services.youtube_provider import YouTubeProvider, YouTubeProviderError


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


def test_provider_searches_only_embeddable_videos_and_caches(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.full_url, timeout))
        return FakeResponse(b'{"items":[{"id":{"videoId":"abc123"},"snippet":{"title":"Cancao Oficial","channelTitle":"Artista","publishedAt":"2026-01-01T00:00:00Z","thumbnails":{"high":{"url":"https://img.test/abc.jpg"}}}}]}')

    monkeypatch.setattr("app.services.youtube_provider.urlopen", fake_urlopen)
    provider = YouTubeProvider("secret", timeout_seconds=3, cache_ttl_seconds=60)
    first = provider.search("Canção Artista", 8)
    second = provider.search("Canção   Artista", 8)

    assert first == second
    assert len(calls) == 1
    query = parse_qs(urlparse(calls[0][0]).query)
    assert query["type"] == ["video"]
    assert query["videoEmbeddable"] == ["true"]
    assert "videoSyndicated" not in query
    assert query["key"] == ["secret"]
    assert first[0]["videoId"] == "abc123"
    assert first[0]["youtubeUrl"] == "https://www.youtube.com/watch?v=abc123"


def test_provider_does_not_cache_empty_results(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append(request.full_url)
        return FakeResponse(b'{"items":[]}')

    monkeypatch.setattr("app.services.youtube_provider.urlopen", fake_urlopen)
    provider = YouTubeProvider("secret", timeout_seconds=3, cache_ttl_seconds=60)
    assert provider.search("Te Adorar Aline Barros", 8) == []
    assert provider.search("Te Adorar Aline Barros", 8) == []
    assert len(calls) == 2


def test_provider_requires_server_key():
    provider = YouTubeProvider("")
    try:
        provider.search("Canção", 5)
    except YouTubeProviderError as error:
        assert "não foi configurada" in str(error)
    else:
        raise AssertionError("A pesquisa não pode ocorrer sem chave no servidor")


def test_youtube_routes_expose_status_and_normalized_results(client, app):
    class FakeProvider:
        enabled = True

        def search(self, query, limit):
            assert query == "Canção Artista"
            assert limit == 5
            return [{"videoId": "video-1", "title": "Canção", "channelTitle": "Artista", "thumbnailUrl": "https://img.test/1.jpg", "youtubeUrl": "https://www.youtube.com/watch?v=video-1", "publishedAt": None}]

    app.extensions["youtube_provider"] = FakeProvider()
    config = client.get("/api/youtube/config")
    response = client.get("/api/youtube/search?q=Can%C3%A7%C3%A3o%20Artista&limit=5")

    assert config.status_code == 200
    assert config.get_json() == {"enabled": True, "provider": "youtube"}
    assert response.status_code == 200
    assert response.get_json()["videos"][0]["videoId"] == "video-1"
    assert client.get("/api/youtube/search?q=ab").status_code == 400


def test_provider_retries_simplified_query_when_empty(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        query = parse_qs(urlparse(request.full_url).query)["q"][0]
        calls.append(query)
        if query == "Te Adorar Meu Prazer Aline Barros":
            return FakeResponse(b'{"items":[{"id":{"videoId":"ef-ADl6_PsY"},"snippet":{"title":"Te Adorar","channelTitle":"Aline Barros"}}]}')
        return FakeResponse(b'{"items":[]}')

    monkeypatch.setattr("app.services.youtube_provider.urlopen", fake_urlopen)
    provider = YouTubeProvider("secret", timeout_seconds=3, cache_ttl_seconds=60)
    result = provider.search("Te Adorar É o Meu Prazer Aline Barros", 8)
    assert calls == ["Te Adorar É o Meu Prazer Aline Barros", "Te Adorar Meu Prazer Aline Barros"]
    assert result[0]["videoId"] == "ef-ADl6_PsY"
