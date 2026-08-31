from datetime import datetime, timezone

import httpx
import pytest

from app.services.music_sources import (
    AuthorizedMusicSourceRegistry,
    MusicSourceCandidate,
    MusicSourceInvalid,
    MusicSourceResult,
    MusicSourceTimeout,
    SafeMusicSourceHttpClient,
    validate_external_url,
)


def safe_url(url, allowed_hosts):
    assert url.startswith("https://")
    assert "licensed.example" in allowed_hosts
    return url


class FakeProvider:
    provider_id = "licensed"
    source_name = "Fonte licenciada"
    allowed_hosts = ("licensed.example",)

    def __init__(self, candidates=None, result=None, error=None):
        self.candidates = candidates or []
        self.result = result
        self.error = error

    def search(self, title, artist=None):
        if self.error:
            raise self.error
        return self.candidates

    def fetch(self, source_id):
        if self.error:
            raise self.error
        return self.result


def candidate(source_id="studio", title="Canção", artist="Artista", url="https://licensed.example/song"):
    return MusicSourceCandidate("licensed", source_id, "Fonte licenciada", url, title, artist, "lyrics_chords")


def result(content="C G\nTrecho autorizado", format="lyrics_chords"):
    return MusicSourceResult("licensed", "studio", "Fonte licenciada", "https://licensed.example/song", "Canção", "Artista", content, format, datetime.now(timezone.utc))


def test_search_scores_title_artist_and_preserves_multiple_versions():
    provider = FakeProvider(candidates=[candidate("studio"), candidate("live", title="Canção (Ao Vivo)")])
    registry = AuthorizedMusicSourceRegistry([provider], url_validator=safe_url)
    matches = registry.search("Canção", "Artista")
    assert [item.source_id for item in matches] == ["studio", "live"]
    assert matches[0].score > matches[1].score


def test_wrong_artist_and_unrelated_title_are_rejected():
    provider = FakeProvider(candidates=[candidate(artist="Outro cantor"), candidate(title="Música diferente")])
    registry = AuthorizedMusicSourceRegistry([provider], url_validator=safe_url)
    assert registry.search("Canção", "Artista") == []


def test_fetch_validates_identity_format_and_content_limit():
    registry = AuthorizedMusicSourceRegistry([FakeProvider(result=result())], url_validator=safe_url)
    assert registry.fetch("licensed", "studio").content.startswith("C G")
    with pytest.raises(MusicSourceInvalid):
        AuthorizedMusicSourceRegistry([FakeProvider(result=result(format="html"))], url_validator=safe_url).fetch("licensed", "studio")
    with pytest.raises(MusicSourceInvalid):
        AuthorizedMusicSourceRegistry([FakeProvider(result=result("x" * 101))], max_content_chars=100, url_validator=safe_url).fetch("licensed", "studio")


def test_timeout_is_classified_when_no_provider_succeeds():
    registry = AuthorizedMusicSourceRegistry([FakeProvider(error=MusicSourceTimeout("slow"))], url_validator=safe_url)
    with pytest.raises(MusicSourceTimeout):
        registry.search("Canção", "Artista")


def test_ssrf_rejects_local_private_credentials_and_non_https():
    public = lambda *_args, **_kwargs: [(None, None, None, None, ("93.184.216.34", 443))]
    private = lambda *_args, **_kwargs: [(None, None, None, None, ("127.0.0.1", 443))]
    assert validate_external_url("https://licensed.example/song", ("licensed.example",), resolver=public)
    for url, resolver in [
        ("http://licensed.example/song", public),
        ("https://user:secret@licensed.example/song", public),
        ("https://localhost/song", private),
        ("https://licensed.example/song", private),
    ]:
        with pytest.raises(MusicSourceInvalid):
            validate_external_url(url, ("licensed.example", "localhost"), resolver=resolver)


def test_safe_http_client_classifies_timeout_and_content_type(monkeypatch):
    monkeypatch.setattr("app.services.music_sources.validate_external_url", lambda url, hosts: url)

    class TimeoutClient:
        def get(self, *_args, **_kwargs):
            raise httpx.ReadTimeout("slow")

    with pytest.raises(MusicSourceTimeout):
        SafeMusicSourceHttpClient(client=TimeoutClient()).get_text("https://licensed.example/song", allowed_hosts=("licensed.example",))

    class HtmlClient:
        def get(self, *_args, **_kwargs):
            return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html>")

    with pytest.raises(MusicSourceInvalid):
        SafeMusicSourceHttpClient(client=HtmlClient()).get_text("https://licensed.example/song", allowed_hosts=("licensed.example",))
