from app.models import PersonalSong
from test_event_permissions import auth, register


def song(index=1):
    return {
        "id": f"local-{index}", "title": f"Música {index}", "artist": "Equipe", "key": "C",
        "blocos": [{"l": "Refrão", "c": "C G Am F\nFrase"}],
        "editorData": {"sections": [{"type": "chorus", "lines": [{"lyrics": "Frase", "chords": [{"chord": "C", "position": 0}]}]}]},
        "fullChordSheet": {"visibility": "private", "source": "user_upload", "content": "C G\nLetra completa"},
    }


def test_sync_is_idempotent_isolated_and_preserves_payload(client, app):
    token_a = register(client, "library-a", "A")
    token_b = register(client, "library-b", "B")
    item = {"clientId": "client-a", "songData": song()}
    first = client.post("/api/library/songs/sync", headers=auth(token_a), json={"items": [item]})
    assert first.status_code == 200
    assert first.get_json()["results"][0]["outcome"] == "created"
    repeat = client.post("/api/library/songs/sync", headers=auth(token_a), json={"items": [item]})
    assert repeat.get_json()["results"][0]["outcome"] == "existing"
    listed = client.get("/api/library/songs", headers=auth(token_a)).get_json()["songs"]
    assert len(listed) == 1
    assert listed[0]["songData"] == song()
    assert client.get("/api/library/songs", headers=auth(token_b)).get_json()["songs"] == []
    with app.app_context():
        assert PersonalSong.query.count() == 1


def test_update_conflict_soft_delete_and_owner_from_token(client, app):
    token_a = register(client, "owner-a", "A")
    token_b = register(client, "owner-b", "B")
    created = client.put("/api/library/songs/stable-id", headers=auth(token_a), json={"songData": song()})
    assert created.status_code == 201
    version = created.get_json()["song"]["version"]
    changed = song(); changed["title"] = "Nova versão"
    updated = client.put("/api/library/songs/stable-id", headers=auth(token_a), json={"songData": changed, "expectedVersion": version})
    assert updated.status_code == 200 and updated.get_json()["song"]["version"] == version + 1
    conflict = client.put("/api/library/songs/stable-id", headers=auth(token_a), json={"songData": song(2), "expectedVersion": version})
    assert conflict.status_code == 409
    assert client.delete("/api/library/songs/stable-id", headers=auth(token_b)).status_code == 204
    assert len(client.get("/api/library/songs", headers=auth(token_a)).get_json()["songs"]) == 1
    assert client.delete("/api/library/songs/stable-id", headers=auth(token_a)).status_code == 204
    assert client.get("/api/library/songs", headers=auth(token_a)).get_json()["songs"] == []
    with app.app_context():
        stored = PersonalSong.query.one()
        assert stored.owner_user_id == "owner-a" and stored.deleted_at is not None


def test_batch_of_136_can_resume_after_partial_failure(client, app):
    token = register(client, "bulk-user", "Bulk")
    items = [{"clientId": f"client-{i}", "songData": song(i)} for i in range(136)]
    items[35] = {"clientId": "broken", "songData": {"title": ""}}
    result = client.post("/api/library/songs/sync", headers=auth(token), json={"items": items}).get_json()["results"]
    assert sum(item["outcome"] == "created" for item in result) == 135
    assert sum(item["outcome"] == "failed" for item in result) == 1
    retry = client.post("/api/library/songs/sync", headers=auth(token), json={"items": [{"clientId": "broken", "songData": song(35)}]})
    assert retry.get_json()["results"][0]["outcome"] == "created"
    assert len(client.get("/api/library/songs", headers=auth(token)).get_json()["songs"]) == 136
    with app.app_context():
        assert PersonalSong.query.count() == 136


def test_authentication_is_required(client):
    assert client.get("/api/library/songs").status_code == 401
    assert client.post("/api/library/songs/sync", json={"items": []}).status_code == 401
