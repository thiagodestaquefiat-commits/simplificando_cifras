from app.models import SharedPlaylist
from test_event_permissions import auth, register


def playlist(**extra):
    return {"name": "Ministro A", "items": [{"song": {"id": "s1", "title": "Música 1", "key": "C", "blocos": [{"l": "", "c": "C G"}]}, "playback": {"semitones": 2, "capo": 0}, "notes": "Entrada suave"}], **extra}


def test_share_requires_login_and_returns_snapshot(client, app):
    assert client.post("/api/shared-playlists", json=playlist()).status_code == 401
    token = register(client, "share-owner", "Dono")
    created = client.post("/api/shared-playlists", headers=auth(token), json=playlist())
    assert created.status_code == 201
    shared_id = created.get_json()["id"]
    fetched = client.get(f"/api/shared-playlists/{shared_id}")
    assert fetched.status_code == 200
    body = fetched.get_json()["playlist"]
    assert body["name"] == "Ministro A"
    assert body["items"][0]["playback"]["semitones"] == 2
    assert body["items"][0]["song"]["title"] == "Música 1"
    with app.app_context():
        assert SharedPlaylist.query.count() == 1


def test_share_validation_and_unknown_ids(client):
    token = register(client, "share-owner-2", "Dono")
    assert client.post("/api/shared-playlists", headers=auth(token), json={"name": "", "items": []}).status_code == 400
    assert client.post("/api/shared-playlists", headers=auth(token), json={"name": "X", "items": [{"song": {}}]}).status_code == 400
    assert client.get("/api/shared-playlists/nao-existe").status_code == 404
    assert client.get("/api/shared-playlists/00000000-0000-0000-0000-000000000000").status_code == 404
