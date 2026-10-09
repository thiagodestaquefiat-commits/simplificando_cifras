from __future__ import annotations

from app.database import db
from app.models import ContextAcknowledgement, EventChange, SongReviewReceipt


def register(client, user_id: str, name: str) -> str:
    response = client.post("/api/collaboration/users", json={"id": user_id, "name": name})
    assert response.status_code == 201
    return response.get_json()["accessToken"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def payload(event_id="event-review", band_id=None):
    return {
        "id": event_id, "title": "Culto", "date": "2026-10-12", "time": "19:00", "location": "ROUDY",
        "leaderId": "leader", "bandId": band_id,
        "members": [{"id": "leader", "name": "Líder", "role": "Violão"}, {"id": "member", "name": "Membro", "role": "Vocal"}],
        "repertoire": [{"id": f"item-{event_id}", "songId": "song-1", "order": 0, "shared": {
            "title": "A alegria", "artist": "ROUDY", "key": "G", "capo": "0", "chordSheet": "G C D", "notes": "Entrada suave"
        }}]
    }


def setup_event(client):
    leader = register(client, "leader", "Líder")
    member = register(client, "member", "Membro")
    outsider = register(client, "outsider", "Visitante")
    created = client.post("/api/collaboration/events", headers=auth(leader), json=payload())
    assert created.status_code == 201, created.get_json()
    return leader, member, outsider, created.get_json()


def review(client, token, body, receipt_id="review-device-1", reviewed_at="2026-10-05T12:00:00+00:00"):
    item = body["repertoire"][0]
    return client.post(
        f"/api/collaboration/events/{body['id']}/repertoire/{item['id']}/review",
        headers=auth(token), json={
            "clientReceiptId": receipt_id,
            "expectedRevision": item["preparation"]["currentRevision"],
            "reviewedAt": reviewed_at,
        }
    )


def test_explicit_review_is_required_idempotent_and_isolated(client, app):
    leader, member, outsider, created = setup_event(client)
    member_view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert member_view["repertoire"][0]["preparation"]["state"] == "NOT_STARTED"

    confirmed = review(client, member, member_view)
    assert confirmed.status_code == 201, confirmed.get_json()
    assert confirmed.get_json()["preparation"]["state"] == "READY"

    repeated = review(client, member, member_view)
    assert repeated.status_code == 200
    assert repeated.get_json()["created"] is False
    assert repeated.get_json()["receipt"]["reviewedAt"].startswith("2026-10-05T12:00:00")

    leader_view = client.get("/api/collaboration/events/event-review", headers=auth(leader)).get_json()
    assert leader_view["repertoire"][0]["preparation"]["state"] == "NOT_STARTED"
    assert client.post(
        "/api/collaboration/events/event-review/repertoire/item-event-review/review",
        headers=auth(outsider), json={"clientReceiptId": "denied", "expectedRevision": "x" * 64}
    ).status_code == 403
    with app.app_context():
        assert SongReviewReceipt.query.count() == 1


def test_relevant_changes_invalidate_but_metadata_does_not(client):
    leader, member, _, created = setup_event(client)
    member_view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, member_view).status_code == 201

    leader_view = client.get("/api/collaboration/events/event-review", headers=auth(leader)).get_json()
    item = leader_view["repertoire"][0]
    key_changed = client.patch(
        "/api/collaboration/events/event-review/repertoire/item-event-review/shared", headers=auth(leader),
        json={"remoteVersion": leader_view["remoteVersion"], **item["shared"], "key": "A"}
    )
    assert key_changed.status_code == 200, key_changed.get_json()
    changed = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()["repertoire"][0]["preparation"]
    assert changed["state"] == "CHANGED_AFTER_REVIEW"
    assert changed["reviewedRevision"] != changed["currentRevision"]
    assert changed["relevantChanges"][0]["type"] == "KEY_CHANGED"
    assert changed["relevantChanges"][0]["before"] == "G"
    assert changed["relevantChanges"][0]["after"] == "A"
    assert changed["evidenceIncomplete"] is False

    current = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, current, "review-after-key", "2026-10-05T13:00:00+00:00").status_code == 200
    assert client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()["repertoire"][0]["preparation"]["state"] == "READY"

    leader_view = client.get("/api/collaboration/events/event-review", headers=auth(leader)).get_json()
    item = leader_view["repertoire"][0]
    structure_changed = client.patch(
        "/api/collaboration/events/event-review/repertoire/item-event-review/shared", headers=auth(leader),
        json={"remoteVersion": leader_view["remoteVersion"], **item["shared"], "chordSheet": "A D E\nPonte: F#m"}
    )
    assert structure_changed.status_code == 200
    changed = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()["repertoire"][0]["preparation"]
    assert changed["state"] == "CHANGED_AFTER_REVIEW"
    assert any(value["type"] == "STRUCTURE_CHANGED" for value in changed["relevantChanges"])

    current = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, current, "review-after-structure", "2026-10-05T14:00:00+00:00").status_code == 200
    leader_view = client.get("/api/collaboration/events/event-review", headers=auth(leader)).get_json()
    item = leader_view["repertoire"][0]
    metadata = client.patch(
        "/api/collaboration/events/event-review/repertoire/item-event-review/shared", headers=auth(leader),
        json={"remoteVersion": leader_view["remoteVersion"], **item["shared"], "title": "A alegria — versão final"}
    )
    assert metadata.status_code == 200
    still_ready = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()["repertoire"][0]["preparation"]
    assert still_ready["state"] == "READY"


def test_old_incomplete_change_never_invents_before_after(client, app):
    leader, member, _, _ = setup_event(client)
    view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, view).status_code == 201
    with app.app_context():
        receipt = SongReviewReceipt.query.one()
        receipt.revision_hash = "0" * 64
        db.session.add(EventChange(id="legacy-incomplete", event_id="event-review", actor_id="leader", actor_name="Líder",
                                  kind="repertoire.song.updated", summary="alterou uma música"))
        db.session.commit()
    preparation = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()["repertoire"][0]["preparation"]
    assert preparation["state"] == "CHANGED_AFTER_REVIEW"
    assert preparation["evidenceIncomplete"] is True
    assert preparation["relevantChanges"] == []


def test_same_song_in_two_events_has_independent_receipts(client, app):
    leader, member, _, _ = setup_event(client)
    second = payload("event-two")
    assert client.post("/api/collaboration/events", headers=auth(leader), json=second).status_code == 201
    first_view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, first_view).status_code == 201
    second_view = client.get("/api/collaboration/events/event-two", headers=auth(member)).get_json()
    assert second_view["repertoire"][0]["preparation"]["state"] == "NOT_STARTED"
    with app.app_context():
        assert SongReviewReceipt.query.count() == 1


def test_stale_offline_confirmation_never_confirms_new_revision(client, app):
    leader, member, _, _ = setup_event(client)
    stale_view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    leader_view = client.get("/api/collaboration/events/event-review", headers=auth(leader)).get_json()
    item = leader_view["repertoire"][0]
    changed = client.patch(
        "/api/collaboration/events/event-review/repertoire/item-event-review/shared", headers=auth(leader),
        json={"remoteVersion": leader_view["remoteVersion"], **item["shared"], "key": "A"}
    )
    assert changed.status_code == 200
    rejected = review(client, member, stale_view, "offline-old-version")
    assert rejected.status_code == 409
    assert rejected.get_json()["erro"]["codigo"] == "revisao_desatualizada"
    assert rejected.get_json()["erro"]["detalhes"]["currentRevision"]
    with app.app_context():
        assert SongReviewReceipt.query.count() == 0


def test_receipt_keeps_team_context_and_other_team_cannot_access(client, app):
    leader = register(client, "leader", "Líder")
    member = register(client, "member", "Membro")
    other = register(client, "other-team", "Outra equipe")
    band = client.post("/api/collaboration/bands", headers=auth(leader), json={"id": "band-a", "name": "Equipe A", "musicalRole": "Violão"})
    assert band.status_code == 201
    assert client.post("/api/collaboration/bands/band-a/members", headers=auth(leader), json={"userId": "member", "accessRole": "member", "musicalRole": "Vocal"}).status_code == 200
    created = client.post("/api/collaboration/events", headers=auth(leader), json=payload(band_id="band-a"))
    assert created.status_code == 201, created.get_json()
    member_view = client.get("/api/collaboration/events/event-review", headers=auth(member)).get_json()
    assert review(client, member, member_view).status_code == 201
    assert client.get("/api/collaboration/events/event-review", headers=auth(other)).status_code == 403
    with app.app_context():
        receipt = SongReviewReceipt.query.one()
        assert receipt.band_id == "band-a"


def test_context_acknowledgement_is_explicit_idempotent_and_isolated(client, app):
    _, member, outsider, _ = setup_event(client)
    body = {"fingerprint": "member:event-review:REVIEW_CHANGED_SONG:item:rev-2", "eventId": "event-review",
            "actionType": "REVIEW_CHANGED_SONG", "acknowledgedAt": "2026-10-05T12:00:00+00:00"}
    created = client.post("/api/collaboration/context-acknowledgements", headers=auth(member), json=body)
    assert created.status_code == 201, created.get_json()
    repeated = client.post("/api/collaboration/context-acknowledgements", headers=auth(member), json=body)
    assert repeated.status_code == 200
    assert repeated.get_json()["created"] is False
    listed = client.get("/api/collaboration/context-acknowledgements", headers=auth(member)).get_json()
    assert [value["fingerprint"] for value in listed["acknowledgements"]] == [body["fingerprint"]]
    assert client.get("/api/collaboration/context-acknowledgements", headers=auth(outsider)).get_json()["acknowledgements"] == []
    denied = client.post("/api/collaboration/context-acknowledgements", headers=auth(outsider), json={**body, "fingerprint": "outsider"})
    assert denied.status_code == 403
    with app.app_context():
        assert ContextAcknowledgement.query.count() == 1
        assert SongReviewReceipt.query.count() == 0, "acknowledgement não cria READY"
