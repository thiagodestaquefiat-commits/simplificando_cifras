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
    searcher = register(client, "shared-a2", "A2")
    found = client.get("/api/shared-songs/search?title=asa%20branca&artist=Luiz%20Gonzaga", headers=auth(searcher)).get_json()
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
    catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=data), 0.97))
    result = IaService(ExplodingProvider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="Asa Branca", modoGeracao="conhecimento_modelo"))
    assert result.titulo == "Asa Branca"


def test_ia_service_ignores_low_score_match():
    calls = []
    class Provider:
        def generate(self, *args, **kwargs):
            calls.append(1)
            return ResumoHarmonicoResponse.model_validate({"titulo": "X", "harmonicSummary": {"blocos": [{"acordes": ["C", "G"]}]}, "confianca": "media"})
    catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data={}), 0.5))
    IaService(Provider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: None).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="X", modoGeracao="conhecimento_modelo"))
    assert calls


def test_own_library_has_priority_over_shared_catalog(client, app):
    other = register(client, "shared-c", "C")
    client.put("/api/library/songs/x", headers=auth(other), json={"songData": ai_song()})
    token = register(client, "shared-d", "D")
    mine = ai_song(aiGenerated=False, sourceInfo={"type": "upload"}, originalKey="A")
    client.put("/api/library/songs/mine", headers=auth(token), json={"songData": mine})
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=luiz%20gonzaga", headers=auth(token)).get_json()["match"]
    assert found["source"] == "personal" and found["clientId"] == "mine" and found["songData"]["tom"] == "A"
    shared = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=luiz%20gonzaga", headers=auth(other)).get_json()["match"]
    assert shared["source"] == "personal" and shared["clientId"] == "x"
    third = register(client, "shared-e", "E")
    assert client.get("/api/shared-songs/search?title=Asa%20Branca", headers=auth(third)).get_json()["match"]["source"] == "shared"
    with app.app_context():
        assert client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Outro", headers=auth(token)).get_json()["match"]["source"] == "shared"


def test_ia_service_prefers_personal_song_over_catalog():
    personal_data = {"titulo": "Minha", "harmonicSummary": {"blocos": [{"acordes": ["A"]}]}, "confianca": "media"}
    catalog = SimpleNamespace(
        search_personal=lambda user_id, title, artist: SimpleNamespace(summary=personal_data) if user_id == "u1" else None,
        search=lambda title, artist: (_ for _ in ()).throw(AssertionError("catálogo não deveria ser consultado")),
    )
    result = IaService(ExplodingProvider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="Minha", modoGeracao="conhecimento_modelo"), user_id="u1")
    assert result.titulo == "Minha"
