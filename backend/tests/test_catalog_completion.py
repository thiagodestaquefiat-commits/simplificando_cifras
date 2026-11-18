"""Música completada vai ao catálogo; edição pessoal não; a mesma versão nunca fica duas vezes (30/10/2026)."""
from app.database import db
from app.models import SharedSong
from app.services.shared_songs_service import SharedSongService, dedupe_titles, normalize_text
from test_event_permissions import auth, register
from test_shared_songs import ai_song

PDF = {"source": "user_upload", "content": "G   C\nOlha pro céu", "sections": []}
PASTED = {"source": "user_text", "content": "G   C\nLetra colada", "sections": []}
AI = {"source": "model_knowledge", "content": "G C\nLetra inventada", "sections": []}


def put(client, token, client_id, song):
    response = client.put(f"/api/library/songs/{client_id}", headers=auth(token), json={"songData": song})
    assert response.status_code < 300, response.get_json()


def rows(app):
    with app.app_context():
        return [(row.title, row.song_key, (row.song_data.get("fullChordSheet") or {}).get("content")) for row in SharedSong.query.order_by(SharedSong.created_at).all()]


def test_completion_by_pdf_reaches_other_accounts(client, app):
    token = register(client, "comp-a", "A")
    put(client, token, "s", ai_song())
    put(client, token, "s", {**ai_song(), "fullChordSheet": PDF})
    assert rows(app) == [("Asa Branca", "G", PDF["content"])]
    reader = register(client, "comp-reader", "R")
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Luiz%20Gonzaga", headers=auth(reader)).get_json()["match"]
    assert found["songData"]["fullChordSheet"]["content"] == PDF["content"]


def test_completion_by_pasted_text_also_goes(client, app):
    token = register(client, "comp-b", "B")
    put(client, token, "s", ai_song())
    put(client, token, "s", {**ai_song(), "fullChordSheet": PASTED})
    assert rows(app)[0][2] == PASTED["content"]


def test_completion_creates_entry_when_catalog_did_not_have_it(client, app):
    token = register(client, "comp-c", "C")
    put(client, token, "s", ai_song(notes="Gerado somente por IA, sem fonte autorizada."))
    assert rows(app) == []
    put(client, token, "s", ai_song(notes="Gerado somente por IA, sem fonte autorizada.", fullChordSheet=PDF))
    assert rows(app) == [("Asa Branca", "G", PDF["content"])]


def test_ai_lyrics_are_not_a_completion(client, app):
    token = register(client, "comp-d", "D")
    put(client, token, "s", ai_song())
    put(client, token, "s", {**ai_song(), "fullChordSheet": AI})
    assert rows(app)[0][2] is None


def test_edits_stay_personal(client, app):
    token = register(client, "comp-e", "E")
    put(client, token, "s", ai_song())
    put(client, token, "s", {**ai_song(), "title": "Minha Asa Branca", "fullChordSheet": PDF})  # mudou o título
    put(client, token, "k", ai_song(id="k", title="Outra"))
    put(client, token, "k", {**ai_song(id="k", title="Outra"), "originalKey": "A", "fullChordSheet": PDF})  # mudou o tom
    assert [row[2] for row in rows(app)] == [None, None]
    put(client, token, "d", ai_song(id="d", title="Terceira"))
    put(client, token, "d", {**ai_song(id="d", title="Terceira"), "fullChordSheet": PDF})
    put(client, token, "d", {**ai_song(id="d", title="Terceira"), "fullChordSheet": {**PDF, "content": "G C\nMinha versão"}})
    assert rows(app)[-1][2] == PDF["content"], "depois de completa, alterar a letra é edição pessoal"


def test_texto_tab_song_never_goes(client, app):
    token = register(client, "comp-f", "F")
    put(client, token, "t", ai_song(title="Digitada", sourceInfo={"type": "text"}))
    put(client, token, "t", ai_song(title="Digitada", sourceInfo={"type": "text"}, fullChordSheet=PDF))
    assert rows(app) == []


def test_manual_song_only_completes_existing_catalog_entry(client, app):
    other = register(client, "comp-g", "G")
    put(client, other, "x", ai_song())  # catálogo tem Asa Branca só com resumo
    token = register(client, "comp-h", "H")
    put(client, token, "base", ai_song(sourceInfo={"type": "manual"}))
    put(client, token, "base", ai_song(sourceInfo={"type": "manual"}, fullChordSheet=PDF))
    put(client, token, "mine", ai_song(id="m", title="Feita do Zero", sourceInfo={"type": "manual"}))
    put(client, token, "mine", ai_song(id="m", title="Feita do Zero", sourceInfo={"type": "manual"}, fullChordSheet=PDF))
    assert rows(app) == [("Asa Branca", "G", PDF["content"])]


def test_completed_entry_is_not_overwritten_by_second_completion(client, app):
    first, second = register(client, "comp-i", "I"), register(client, "comp-j", "J")
    put(client, first, "s", ai_song())
    put(client, second, "s", ai_song())
    put(client, first, "s", {**ai_song(), "fullChordSheet": PDF})
    put(client, second, "s", {**ai_song(), "fullChordSheet": PASTED})
    assert rows(app) == [("Asa Branca", "G", PDF["content"])]


def test_same_version_twice_is_merged_but_other_key_stays(client, app):
    token = register(client, "comp-k", "K")
    put(client, token, "a", ai_song())
    with app.app_context():
        # Simula duas pessoas salvando ao mesmo tempo: a segunda entrada passou antes da checagem.
        summary = SharedSongService._summary_from_song(ai_song())
        SharedSongService._new_entry(summary, normalize_text("Asa Branca"), normalize_text("Luiz Gonzaga"), "comp-k")
        other_key = SharedSongService._summary_from_song(ai_song(originalKey="A"))
        SharedSongService._new_entry(other_key, normalize_text("Asa Branca"), normalize_text("Luiz Gonzaga"), "comp-k")
        db.session.commit()
        assert SharedSong.query.count() == 3
        assert dedupe_titles({"asa branca"}) == 1
        assert sorted(row.song_key for row in SharedSong.query.all()) == ["A", "G"]


def test_save_request_cleans_up_duplicate_of_same_version(client, app):
    token = register(client, "comp-l", "L")
    put(client, token, "a", ai_song())
    with app.app_context():
        summary = SharedSongService._summary_from_song(ai_song())
        SharedSongService._new_entry(summary, normalize_text("Asa Branca"), normalize_text("Luiz Gonzaga"), "x")
        db.session.commit()
    put(client, token, "a", {**ai_song(), "fullChordSheet": PDF})
    assert rows(app) == [("Asa Branca", "G", PDF["content"])]
