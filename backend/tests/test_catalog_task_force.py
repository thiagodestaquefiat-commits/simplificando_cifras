"""Força-tarefa do catálogo: CATALOG_OPEN_CONTRIBUTION e música completada que precisa chegar às outras contas."""
from app.models import SharedSong
from test_event_permissions import auth, register
from test_shared_songs import ai_song

PDF = {"source": "user_upload", "content": "G   C\nOlha pro céu", "sections": []}
TYPED = {"source": "user_text", "content": "G   C\nMinha versão", "sections": []}
AI_ONLY = "Confiança da IA: média.\nGerado somente por IA, sem fonte autorizada; exige revisão humana antes de salvar."


def catalog(app):
    with app.app_context():
        return {song.title: song.song_data.get("fullChordSheet") for song in SharedSong.query.all()}


def test_open_mode_sends_every_saved_song_to_catalog(client, app):
    app.config["CATALOG_OPEN_CONTRIBUTION"] = True
    token = register(client, "open-a", "A")
    client.put("/api/library/songs/t", headers=auth(token), json={"songData": ai_song(title="Digitada", sourceInfo={"type": "text"}, fullChordSheet=TYPED)})
    client.put("/api/library/songs/m", headers=auth(token), json={"songData": ai_song(title="Feita a Mao", aiGenerated=False, sourceInfo={"type": "manual"})})
    client.put("/api/library/songs/i", headers=auth(token), json={"songData": ai_song(title="Velha IA", notes=AI_ONLY)})
    stored = catalog(app)
    assert set(stored) == {"Digitada", "Feita a Mao", "Velha IA"}
    assert stored["Digitada"]["content"] == "G   C\nMinha versão"


def test_pdf_completes_old_ai_only_song_even_with_normal_rules(client, app):
    token = register(client, "open-b", "B")
    old = ai_song(title="Velha IA", sourceInfo={"type": "manual"}, notes=AI_ONLY)
    client.put("/api/library/songs/s", headers=auth(token), json={"songData": old})
    assert catalog(app) == {}
    client.put("/api/library/songs/s", headers=auth(token), json={"songData": {**old, "fullChordSheet": PDF}})
    assert catalog(app)["Velha IA"]["source"] == "user_upload"


def test_completion_with_slightly_different_artist_updates_existing_entry(client, app):
    token = register(client, "open-c", "C")
    client.put("/api/library/songs/a", headers=auth(token), json={"songData": ai_song()})
    client.put("/api/library/songs/b", headers=auth(token),
               json={"songData": ai_song(id="b", artist="Luiz Gonzaga e Banda", fullChordSheet=PDF)})
    with app.app_context():
        rows = SharedSong.query.all()
        assert len(rows) == 1 and rows[0].song_data["fullChordSheet"]["content"] == PDF["content"]
    reader = register(client, "open-d", "D")
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Luiz%20Gonzaga", headers=auth(reader)).get_json()["match"]
    assert found["songData"]["fullChordSheet"]["content"] == PDF["content"]


def test_different_artist_stays_a_different_song(client, app):
    token = register(client, "open-e", "E")
    client.put("/api/library/songs/a", headers=auth(token), json={"songData": ai_song(title="Ruja o Leão", artist="Aline Barros")})
    client.put("/api/library/songs/b", headers=auth(token), json={"songData": ai_song(id="b", title="Ruja o Leão", artist="Fernandinho", fullChordSheet=PDF)})
    with app.app_context():
        assert SharedSong.query.count() == 2
