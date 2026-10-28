"""Decisão de 24/10/2026: o catálogo aceita várias versões da mesma música.

Versão = título + artista + tom. Mesmo nome com outro artista OU outro tom entra como outra
versão; mesmo título + artista + tom continua sendo a mesma (só atualiza se a nova for mais completa).
A busca lista as versões para a pessoa escolher.
"""
import uuid

from app.database import db
from app.models import SharedSong
from app.services.shared_songs_service import duplicate_groups, key_identity, normalize_text, same_key
from test_catalog_task_force import PDF
from test_event_permissions import auth, register
from test_shared_songs import ai_song


def test_key_identity_handles_enharmonics_and_minor():
    assert key_identity("Db") == key_identity("C#") and key_identity("A") != key_identity("Am")
    assert key_identity("") is None and same_key("", "G") and not same_key("G", "A")


def test_same_title_and_artist_with_other_key_is_another_version(client, app):
    token = register(client, "ver-a", "A")
    client.put("/api/library/songs/g", headers=auth(token), json={"songData": ai_song(title="Gratidão", artist="Felipe Rodrigues", originalKey="G")})
    client.put("/api/library/songs/a", headers=auth(token), json={"songData": ai_song(id="a", title="Gratidão", artist="Felipe Rodrigues", originalKey="A", fullChordSheet=PDF)})
    client.put("/api/library/songs/g2", headers=auth(token), json={"songData": ai_song(id="g2", title="Gratidão", artist="Felipe Rodrigues", originalKey="G")})
    with app.app_context():
        rows = SharedSong.query.filter_by(normalized_title=normalize_text("Gratidão")).all()
        assert sorted(row.song_key for row in rows) == ["A", "G"], "dois tons = duas versões; o mesmo tom não repete"


def test_same_version_still_upgrades_summary_to_full_sheet(client, app):
    token = register(client, "ver-b", "B")
    client.put("/api/library/songs/s", headers=auth(token), json={"songData": ai_song(title="Rei", artist="Banda", originalKey="D")})
    client.put("/api/library/songs/f", headers=auth(token), json={"songData": ai_song(id="f", title="Rei", artist="Banda", originalKey="D", fullChordSheet=PDF)})
    with app.app_context():
        rows = SharedSong.query.filter_by(normalized_title="rei").all()
        assert len(rows) == 1 and rows[0].song_data["fullChordSheet"]["content"] == PDF["content"]


def test_versions_endpoint_lists_all_versions_and_opens_the_chosen_one(client, app):
    token = register(client, "ver-c", "C")
    client.put("/api/library/songs/1", headers=auth(token), json={"songData": ai_song(id="1", title="Ruja o Leão", artist="Aline Barros", originalKey="E")})
    client.put("/api/library/songs/2", headers=auth(token), json={"songData": ai_song(id="2", title="Ruja o Leão", artist="Fernandinho", originalKey="G", fullChordSheet=PDF)})
    client.put("/api/library/songs/3", headers=auth(token), json={"songData": ai_song(id="3", title="Ruja o Leão", artist="Fernandinho", originalKey="A")})
    client.put("/api/library/songs/4", headers=auth(token), json={"songData": ai_song(id="4", title="Outra Música", artist="X")})
    reader = register(client, "ver-d", "D")
    assert client.get("/api/shared-songs/versions?title=x").status_code == 401
    assert client.get("/api/shared-songs/versions", headers=auth(reader)).status_code == 400
    versions = client.get("/api/shared-songs/versions?title=ruja%20o%20leao", headers=auth(reader)).get_json()["versions"]
    assert len(versions) == 3, "as três versões, sem a outra música"
    assert {(v["artist"], v["key"]) for v in versions} == {("Aline Barros", "E"), ("Fernandinho", "G"), ("Fernandinho", "A")}
    assert versions[0]["hasFullSheet"] is True, "sem artista na busca: a com Letra + Cifras primeiro"
    by_artist = client.get("/api/shared-songs/versions?title=ruja%20o%20leao&artist=Aline%20Barros", headers=auth(reader)).get_json()["versions"]
    assert by_artist[0]["artist"] == "Aline Barros", "artista buscado primeiro"

    chosen = next(v for v in versions if v["key"] == "G")
    opened = client.get(f"/api/shared-songs/versions/{chosen['id']}", headers=auth(reader))
    assert opened.status_code == 200
    body = opened.get_json()
    assert body["titulo"] == "Ruja o Leão" and body["tom"] == "G" and body["fullChordSheet"]["content"] == PDF["content"]
    assert client.get("/api/shared-songs/versions/nao-existe", headers=auth(reader)).status_code == 404


def test_cleanup_tool_only_merges_identical_versions(client, app):
    register(client, "ver-e", "E")
    with app.app_context():
        def add(key):
            song = SharedSong(id=str(uuid.uuid4()), title="Alfa", artist="Marine", normalized_title="alfa", normalized_artist="marine",
                              song_key=key, song_data={"fullChordSheet": None}, times_searched=0)
            db.session.add(song)
            return song
        add("E"), add("E"), add("D")
        db.session.commit()
        groups = duplicate_groups()
        assert [sorted(song.song_key for song in group) for group in groups] == [["E", "E"]], "tom D é outra versão"
