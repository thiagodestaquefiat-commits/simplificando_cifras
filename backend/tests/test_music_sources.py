from datetime import datetime, timezone

from app.services.music_sources import AuthorizedMusicSourceRegistry, MusicSourceResult


class FakeProvider:
    name = "licensed-test"

    def __init__(self, url="https://licensed.example/song", content="C G\nTrecho autorizado"):
        self.url = url
        self.content = content

    def find(self, title, artist=None):
        return MusicSourceResult(self.name, self.url, title, artist, self.content, datetime.now(timezone.utc))


def test_registry_accepts_only_explicit_https_allowlist():
    registry = AuthorizedMusicSourceRegistry([FakeProvider()], allowed_hosts=["licensed.example"])
    assert registry.find("Canção", "Artista").source_name == "licensed-test"
    assert AuthorizedMusicSourceRegistry([FakeProvider("http://licensed.example/song")], allowed_hosts=["licensed.example"]).find("Canção") is None
    assert AuthorizedMusicSourceRegistry([FakeProvider("https://other.example/song")], allowed_hosts=["licensed.example"]).find("Canção") is None


def test_registry_rejects_credentials_and_oversized_content():
    assert AuthorizedMusicSourceRegistry([FakeProvider("https://user:secret@licensed.example/song")], allowed_hosts=["licensed.example"]).find("Canção") is None
    registry = AuthorizedMusicSourceRegistry([FakeProvider(content="x" * 101)], allowed_hosts=["licensed.example"], max_content_chars=100)
    assert registry.find("Canção") is None
