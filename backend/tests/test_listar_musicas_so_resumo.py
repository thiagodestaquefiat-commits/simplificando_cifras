import io

import listar_musicas_so_resumo as report
from app.models import SharedSong
from test_event_permissions import auth, register
from test_shared_songs import ai_song

PDF = {"source": "user_upload", "content": "G C\nLetra", "sections": []}


def test_lists_only_summary_songs_and_never_writes(client, app):
    token = register(client, "report-a", "A")
    client.put("/api/library/songs/a", headers=auth(token), json={"songData": ai_song(title="So Resumo")})
    client.put("/api/library/songs/b", headers=auth(token), json={"songData": ai_song(id="b", title="Completa", fullChordSheet=PDF)})
    register(client, "report-b", "B")
    with app.app_context():
        from app.database import db
        from app.models import PersonalSong
        db.session.add(PersonalSong(
            id="p1", owner_user_id="report-b", client_id="x",
            song_data=ai_song(title="So Resumo", fullChordSheet=PDF), version=1,
        ))
        db.session.commit()
        before = {song.id: dict(song.song_data) for song in SharedSong.query.all()}
    out = io.StringIO()
    rows = report.main(app=app, csv_path=None, out=out)
    assert [(row["titulo"], row["versao_completa_em_biblioteca"]) for row in rows] == [("So Resumo", "SIM")]
    assert "Só com resumo harmônico: 1" in out.getvalue()
    assert "report-a" not in out.getvalue() and "report-b" not in out.getvalue()
    with app.app_context():
        assert {song.id: dict(song.song_data) for song in SharedSong.query.all()} == before


def test_csv_is_opt_in_and_uses_explicit_destination(client, app, tmp_path):
    token = register(client, "report-c", "C")
    client.put("/api/library/songs/c", headers=auth(token), json={"songData": ai_song(title="Pendente")})
    destination = tmp_path / "private-report" / "incompletas.csv"
    report.main(app=app, csv_path=destination, out=io.StringIO())
    assert destination.exists()
    assert not (tmp_path / "musicas_so_resumo.csv").exists()
