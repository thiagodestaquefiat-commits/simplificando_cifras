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
    assert query["videoSyndicated"] == ["true"]
    assert query["key"] == ["secret"]
    assert first[0]["videoId"] == "abc123"
    assert first[0]["youtubeUrl"] == "https://www.youtube.com/watch?v=abc123"


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
