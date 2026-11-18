"""Recuperação da força-tarefa: músicas completadas antes de 30/10/2026 chegam ao catálogo."""
from app.database import db
from app.models import PersonalSong, SharedSong
from app.services.shared_songs_service import backfill_completions
from test_event_permissions import auth, register
from test_shared_songs import ai_song

PDF = {"source": "user_upload", "content": "G   C\nOlha pro céu", "sections": []}


def save(client, token, client_id, song):
    assert client.put(f"/api/library/songs/{client_id}", headers=auth(token), json={"songData": song}).status_code < 300


def test_backfill_recovers_task_force_completions(client, app):
    team, reader = register(client, "rec-f", "F"), register(client, "rec-f2", "F2")
    save(client, team, "a", ai_song())
    save(client, team, "b", ai_song(id="b", title="Outra"))
    save(client, team, "t", ai_song(id="t", title="Particular", sourceInfo={"type": "text"}))
    with app.app_context():
        # Simula o que aconteceu antes desta correção: a biblioteca foi completada, o catálogo não.
        for personal in PersonalSong.query.all():
            data = dict(personal.song_data)
            if data["title"] == "Asa Branca":
                data["fullChordSheet"] = PDF
            if data["title"] == "Outra":
                data.update(originalKey="A", fullChordSheet=PDF)  # tom trocado: é outra versão, não completa
            personal.song_data = data
        db.session.commit()
        report = backfill_completions()
        db.session.commit()
        assert [(item["title"], item["source"]) for item in report] == [("Asa Branca", "user_upload")]
        assert SharedSong.query.count() == 2
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Luiz%20Gonzaga", headers=auth(reader)).get_json()["match"]
    assert found["songData"]["fullChordSheet"]["content"] == PDF["content"]
    with app.app_context():
        assert backfill_completions() == [], "rodar de novo não muda nada"
