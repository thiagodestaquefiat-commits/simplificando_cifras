from types import SimpleNamespace

from app.models import SharedSong
from app.schemas.resumo_harmonico import ResumoHarmonicoRequest, ResumoHarmonicoResponse
from app.services.ia_service import IaService
from app.services.shared_songs_service import SharedSongMatch, normalize_text
from test_event_permissions import auth, register


def ai_song(**overrides):
    value = {
        "id": "ai-1", "title": "Asa Branca", "artist": "Luiz Gonzaga", "originalKey": "G", "capo": 0,
        "source": "ai", "aiGenerated": True, "sourceInfo": {"type": "manual", "name": None, "url": None},
        "sections": [{"label": "Verso", "hideLabel": False, "lines": [{"lyrics": "", "repeticoes": 2, "chords": [{"chord": "G", "position": 0}, {"chord": "C", "position": 3}]}]}],
    }
    value.update(overrides)
    return value


def test_normalize_text_strips_accents_and_punctuation():
    assert normalize_text("  Coração, Valente!! ") == "coracao valente"


def test_ai_song_is_contributed_once_and_searchable(client, app):
    token = register(client, "shared-a", "A")
    for client_id in ("one", "two"):
        client.put(f"/api/library/songs/{client_id}", headers=auth(token), json={"songData": ai_song()})
    with app.app_context():
        stored = SharedSong.query.one()
        assert stored.contributed_by == "shared-a" and stored.song_data["fullChordSheet"] is None
        assert stored.song_data["harmonicSummary"]["blocos"][0]["acordes"] == ["G", "C"]
    found = client.get("/api/shared-songs/search?title=asa%20branca&artist=Luiz%20Gonzaga", headers=auth(token)).get_json()
    assert found["match"]["title"] == "Asa Branca" and found["match"]["score"] == 1.0
    assert found["match"]["timesSearched"] == 1
    assert client.get("/api/shared-songs/search?title=", headers=auth(token)).status_code == 400


def test_user_content_is_never_shared(client, app):
    token = register(client, "shared-b", "B")
    client.put("/api/library/songs/up", headers=auth(token), json={"songData": ai_song(sourceInfo={"type": "upload"})})
    client.put("/api/library/songs/manual", headers=auth(token), json={"songData": ai_song(aiGenerated=False, title="Outra")})
    with app.app_context():
        assert SharedSong.query.count() == 0


class ExplodingProvider:
    def generate(self, *args, **kwargs):
        raise AssertionError("IA não deveria ser chamada")


def test_ia_service_returns_catalog_match_without_calling_provider():
    data = {"titulo": "Asa Branca", "artista": "Luiz Gonzaga", "tom": "G", "harmonicSummary": {"blocos": [{"acordes": ["G", "C"]}]}, "confianca": "media"}
    catalog = SimpleNamespace(search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=data), 0.97))
    result = IaService(ExplodingProvider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="Asa Branca"))
    assert result.titulo == "Asa Branca"


def test_ia_service_ignores_low_score_match():
    calls = []
    class Provider:
        def generate(self, *args, **kwargs):
            calls.append(1)
            return ResumoHarmonicoResponse.model_validate({"titulo": "X", "harmonicSummary": {"blocos": [{"acordes": ["C", "G"]}]}, "confianca": "media"})
    catalog = SimpleNamespace(search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data={}), 0.5))
    IaService(Provider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="X"))
    assert calls
