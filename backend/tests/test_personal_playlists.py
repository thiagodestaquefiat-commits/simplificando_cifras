from app.models import PersonalPlaylist
from test_event_permissions import auth, register


def data(name="Louvores", **extra):
    return {
        "name": name,
        "description": "Ministro Felipe",
        "pinned": True,
        "items": [
            {"id": "pli_1", "songClientId": "c-111", "songId": "s1", "title": "Gratidão", "artist": "Felipe Rodrigues",
             "playback": {"semitones": -2, "capo": 0, "evil": "x", "bpm": True}, "notes": "Entrada suave"},
        ],
        **extra,
    }


def test_requires_login(client):
    assert client.get("/api/personal-playlists").status_code == 401
    assert client.put("/api/personal-playlists/pl_1", json={"data": data()}).status_code == 401


def test_create_list_and_update_with_versions(client):
    token = register(client, "pp-owner", "Dono")
    created = client.put("/api/personal-playlists/pl_1", headers=auth(token), json={"baseVersion": None, "data": data()})
    assert created.status_code == 201
    playlist = created.get_json()["playlist"]
    assert playlist["version"] == 1
    item = playlist["data"]["items"][0]
    assert item["songClientId"] == "c-111"
    assert item["playback"] == {"semitones": -2, "capo": 0}, "remove campos estranhos e números inválidos"

    listed = client.get("/api/personal-playlists", headers=auth(token)).get_json()["playlists"]
    assert [p["clientId"] for p in listed] == ["pl_1"]

    updated = client.put("/api/personal-playlists/pl_1", headers=auth(token), json={"baseVersion": 1, "data": data("Louvores 2")})
    assert updated.status_code == 200
    assert updated.get_json()["playlist"]["version"] == 2

    # Outro aparelho ainda na versão 1: conflito com a versão atual na resposta.
    stale = client.put("/api/personal-playlists/pl_1", headers=auth(token), json={"baseVersion": 1, "data": data("Velha")})
    assert stale.status_code == 409
    assert stale.get_json()["playlist"]["data"]["name"] == "Louvores 2"

    forced = client.put("/api/personal-playlists/pl_1", headers=auth(token), json={"baseVersion": 1, "force": True, "data": data("Escolhida")})
    assert forced.status_code == 200 and forced.get_json()["playlist"]["version"] == 3


def test_delete_is_tombstone_and_can_be_recreated(client, app):
    token = register(client, "pp-owner-2", "Dono")
    client.put("/api/personal-playlists/pl_x", headers=auth(token), json={"data": data()})
    assert client.delete("/api/personal-playlists/pl_x", headers=auth(token), json={"baseVersion": 5}).status_code == 409
    deleted = client.delete("/api/personal-playlists/pl_x", headers=auth(token), json={"baseVersion": 1})
    assert deleted.status_code == 200 and deleted.get_json()["playlist"]["deleted"] is True
    listed = client.get("/api/personal-playlists", headers=auth(token)).get_json()["playlists"]
    assert listed[0]["deleted"] is True
    again = client.put("/api/personal-playlists/pl_x", headers=auth(token), json={"baseVersion": 2, "data": data()})
    assert again.status_code == 200 and again.get_json()["playlist"]["deleted"] is False
    with app.app_context():
        assert PersonalPlaylist.query.count() == 1


def test_owner_isolation_and_validation(client):
    a = register(client, "pp-a", "A")
    b = register(client, "pp-b", "B")
    client.put("/api/personal-playlists/pl_same", headers=auth(a), json={"data": data("Da A")})
    assert client.get("/api/personal-playlists", headers=auth(b)).get_json()["playlists"] == []
    # Mesmo clientId em outra conta cria outra playlist, sem tocar na da A.
    assert client.put("/api/personal-playlists/pl_same", headers=auth(b), json={"data": data("Da B")}).status_code == 201
    assert client.get("/api/personal-playlists", headers=auth(a)).get_json()["playlists"][0]["data"]["name"] == "Da A"
    assert client.put("/api/personal-playlists/bad id!", headers=auth(a), json={"data": data()}).status_code == 400
    assert client.put("/api/personal-playlists/pl_2", headers=auth(a), json={"data": {"name": "", "items": []}}).status_code == 400
    assert client.put("/api/personal-playlists/pl_2", headers=auth(a), json={"data": {"name": "X", "items": [{"id": "i"}]}}).status_code == 400
    big_cover = client.put("/api/personal-playlists/pl_3", headers=auth(a), json={"data": data(coverImage="https://site.externo/capa.png")})
    assert big_cover.status_code == 201 and big_cover.get_json()["playlist"]["data"]["coverImage"] is None


def test_unchanged_cursor(client):
    token = register(client, "pp-cursor", "Dono")
    client.put("/api/personal-playlists/pl_c", headers=auth(token), json={"data": data()})
    first = client.get("/api/personal-playlists", headers=auth(token)).get_json()
    again = client.get("/api/personal-playlists?since=" + first["cursor"], headers=auth(token)).get_json()
    assert again == {"unchanged": True, "cursor": first["cursor"]}
    client.put("/api/personal-playlists/pl_c", headers=auth(token), json={"baseVersion": 1, "data": data("Nova")})
    changed = client.get("/api/personal-playlists?since=" + first["cursor"], headers=auth(token)).get_json()
    assert changed["playlists"][0]["data"]["name"] == "Nova"
