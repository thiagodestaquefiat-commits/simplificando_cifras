from copy import deepcopy
from app.database import db
from app.models import PersonalSong, SharedSong
from app.models.playlist_collaboration import PlaylistInvite, PlaylistNotification, PlaylistMember, CollaborativePlaylist
from test_event_permissions import register, auth

BASE = "/api/collaborative-playlists"


def data():
    return {"name": "Ensaio", "description": "", "coverImage": None, "items": [{"id": "item-1", "song": {"id": "private-song", "title": "Canção", "key": "G", "blocos": [{"l": "Verso", "c": "G C D"}]}, "playback": {"semitones": 0}, "notes": ""}]}


def setup(client):
    a = register(client, "playlist-owner", "Ana")
    b = register(client, "playlist-guest", "Bruno")
    c = register(client, "playlist-outsider", "Carlos")
    response = client.post(BASE, headers=auth(a), json={"clientId": "local-1", "data": data()})
    assert response.status_code == 201, response.get_json()
    row = response.get_json()["playlist"]
    return a, b, c, row


def join(client, a, b, row):
    response = client.post(f'{BASE}/{row["id"]}/invitations', headers=auth(a), json={"recipientId": "playlist-guest"})
    assert response.status_code == 201
    return client.post(f'{BASE}/invitations/{response.get_json()["id"]}/accept', headers=auth(b), json={})


def edit(client, token, row, desired, op="operation-one", **extra):
    return client.post(f'{BASE}/{row["id"]}/operations', headers=auth(token), json={"operationId": op, "base": row["data"], "data": desired, **extra})


def test_accept_permissions_notifications_and_private_libraries(client, app):
    a, b, c, row = setup(client)
    assert client.get(BASE).status_code == 401
    assert edit(client, b, row, data()).status_code == 404
    assert join(client, a, b, row).status_code == 200
    desired = deepcopy(row["data"])
    desired["items"][0]["playback"]["semitones"] = 2
    response = edit(client, b, row, desired)
    assert response.status_code == 200, response.get_json()
    assert len(response.get_json()["playlist"]["members"]) == 2
    assert all(m["role"] == "owner" for m in response.get_json()["playlist"]["members"])
    inbox = client.get(BASE, headers=auth(a)).get_json()
    assert any("tom" in n["summary"] and n["actorName"] == "Bruno" for n in inbox["notifications"])
    assert client.get(BASE, headers=auth(c)).get_json()["playlists"] == []
    with app.app_context():
        assert PersonalSong.query.count() == SharedSong.query.count() == 0
        assert PlaylistMember.query.count() == 2


def test_disjoint_merge_conflict_and_retry_are_safe(client, app):
    a, b, _, row = setup(client)
    join(client, a, b, row)
    first = deepcopy(row["data"]); first["name"] = "Novo nome"
    assert edit(client, a, row, first).status_code == 200
    second = deepcopy(row["data"]); second["items"][0]["notes"] = "Entrada suave"
    merged = edit(client, b, row, second, "operation-two")
    assert merged.status_code == 200
    assert merged.get_json()["playlist"]["data"]["name"] == "Novo nome"
    assert merged.get_json()["playlist"]["data"]["items"][0]["notes"] == "Entrada suave"
    retry = edit(client, b, row, second, "operation-two")
    assert retry.get_json()["playlist"]["version"] == merged.get_json()["playlist"]["version"]
    incompatible = deepcopy(row["data"]); incompatible["name"] = "Nome concorrente"
    assert edit(client, b, row, incompatible, "operation-three").status_code == 409
    with app.app_context():
        assert PlaylistNotification.query.filter_by(actor_id="playlist-guest").count() == 2  # acceptance + edit


def test_link_preview_accept_expiry_and_single_use(client, app):
    a, b, c, row = setup(client)
    link = client.post(f'{BASE}/{row["id"]}/invitations', headers=auth(a), json={}).get_json()["token"]
    preview = client.get(f"{BASE}/links/{link}").get_json()
    assert preview["playlistName"] == "Ensaio" and "items" not in preview
    assert client.post(f"{BASE}/invitations/{link}/accept", json={"link": True}).status_code == 401
    response = client.post(f"{BASE}/invitations/{link}/accept", headers=auth(b), json={"link": True})
    assert response.status_code == 200
    assert client.post(f"{BASE}/invitations/{link}/accept", headers=auth(b), json={"link": True}).status_code == 200
    assert client.post(f"{BASE}/invitations/{link}/accept", headers=auth(c), json={"link": True}).status_code == 409
    assert client.get(f"{BASE}/links/{link}").status_code == 410
    from datetime import timedelta
    from app.models.playlist_collaboration import now
    with app.app_context():
        invitation = PlaylistInvite.query.first(); invitation.expires_at = now() - timedelta(days=1); db.session.commit()
    assert client.get(f"{BASE}/links/{link}").status_code == 410


def test_reject_and_addressed_invite_are_private(client):
    a, b, c, row = setup(client)
    invitation = client.post(f'{BASE}/{row["id"]}/invitations', headers=auth(a), json={"recipientId": "playlist-guest"}).get_json()["id"]
    assert len(client.get(BASE, headers=auth(b)).get_json()["invitations"]) == 1
    assert client.post(f"{BASE}/invitations/{invitation}/accept", headers=auth(c), json={}).status_code == 404
    assert client.post(f"{BASE}/invitations/{invitation}/reject", headers=auth(b), json={}).status_code == 200
    assert client.get(BASE, headers=auth(b)).get_json()["playlists"] == []


def test_coowner_can_invite_delete_and_read_is_scoped(client):
    a, b, c, row = setup(client)
    joined = join(client, a, b, row).get_json()["playlist"]
    assert client.post(f'{BASE}/{row["id"]}/invitations', headers=auth(b), json={"recipientId": "playlist-outsider"}).status_code == 201
    assert edit(client, b, row, data(), "operation-delete", delete=True, baseVersion=1).status_code == 409
    response = edit(client, b, joined, data(), "operation-delete", delete=True, baseVersion=joined["version"])
    assert response.status_code == 200 and response.get_json()["playlist"]["deleted"] is True
    inbox = client.get(BASE, headers=auth(a)).get_json()
    assert inbox["playlists"][0]["deleted"] is True
    notice = next(n for n in inbox["notifications"] if "excluiu" in n["summary"])
    ident = notice["id"].split(":", 1)[1]
    assert client.post(f"{BASE}/notifications/{ident}/read", headers=auth(c)).status_code == 404
    assert client.post(f"{BASE}/notifications/{ident}/read", headers=auth(a)).status_code == 200


def test_validation_deduplication_and_order_conflicts(client):
    a, b, _, row = setup(client)
    assert client.post(BASE, headers=auth(a), json={"clientId": "local-1", "data": data()}).get_json()["playlist"]["id"] == row["id"]
    bad = data(); bad["items"].append(deepcopy(bad["items"][0]))
    assert edit(client, a, row, bad).status_code == 400
    assert client.post(BASE, headers=auth(a), json={"clientId": "empty", "data": {"name": "Vazia", "items": []}}).status_code == 201
    join(client, a, b, row)
    changed = deepcopy(row["data"]); changed["items"] = []
    assert edit(client, a, row, changed).status_code == 200
    changed = deepcopy(row["data"]); changed["items"][0]["notes"] = "Não ressuscitar"
    assert edit(client, b, row, changed, "operation-edit-deleted").status_code == 409


def test_distinct_playback_fields_merge_and_unchanged_poll_is_small(client):
    a, b, _, row = setup(client)
    join(client, a, b, row)
    first = deepcopy(row["data"]); first["items"][0]["playback"]["capo"] = 2
    assert edit(client, a, row, first).status_code == 200
    second = deepcopy(row["data"]); second["items"][0]["playback"]["bpm"] = 120
    merged = edit(client, b, row, second, "operation-bpm").get_json()["playlist"]
    assert merged["data"]["items"][0]["playback"] == {"semitones": 0, "capo": 2, "bpm": 120}
    state = client.get(BASE, headers=auth(a)).get_json()
    unchanged = client.get(BASE + "?since=" + state["cursor"], headers=auth(a)).get_json()
    assert unchanged == {"unchanged": True, "cursor": state["cursor"]}
    assert client.post(BASE, headers=auth(a), json=[]).status_code == 400
