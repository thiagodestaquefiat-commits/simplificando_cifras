from __future__ import annotations

from app.database import db
from app.models import Event, EventMember, EventRepertoireItem, PersonalRepertoireOverride


def register(client, user_id: str, name: str) -> str:
    response = client.post("/api/collaboration/users", json={"id": user_id, "name": name})
    assert response.status_code == 201, response.get_json()
    return response.get_json()["accessToken"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def event_payload() -> dict:
    return {
        "id": "event-sunday",
        "title": "Culto de domingo",
        "date": "2026-09-06",
        "time": "19:00",
        "location": "Igreja Central",
        "eventLocation": {
            "name": "Igreja Central", "formattedAddress": "Rua das Flores, 100, Blumenau, SC, Brasil",
            "street": "Rua das Flores", "streetNumber": "100", "district": "Centro",
            "city": "Blumenau", "state": "Santa Catarina", "postalCode": "89000-000",
            "country": "Brasil", "latitude": -26.9187, "longitude": -49.066,
            "placeId": "place-church-1", "provider": "geoapify",
        },
        "description": "Passagem às 18h",
        "leaderId": "leader-user",
        "members": [
            {"id": "leader-user", "name": "Líder", "role": "Violão"},
            {"id": "member-user", "name": "Integrante", "role": "Vocal"},
        ],
        "repertoire": [
            {"id": "item-one", "songId": "song-1", "order": 0, "shared": {"title": "Canção oficial", "artist": "Equipe", "key": "G", "capo": "2", "chordSheet": "Verso\nG C D", "notes": "Oficial"}},
            {"id": "item-two", "songId": "song-2", "order": 1, "shared": {"key": "C", "notes": "Final"}},
        ],
    }


def test_personal_override_is_private_and_shared_edit_requires_leader(client, app):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    outsider = register(client, "outsider-user", "Visitante")

    created = client.post("/api/collaboration/events", headers=auth(leader), json=event_payload())
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["permissions"]["canEditShared"] is True
    assert created.get_json()["eventLocation"]["placeId"] == "place-church-1"
    assert created.get_json()["eventLocation"]["latitude"] == -26.9187

    denied = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(member),
        json={"key": "D", "notes": "Tentativa"},
    )
    assert denied.status_code == 403
    assert denied.get_json()["erro"]["codigo"] == "somente_lider"
    assert client.put("/api/collaboration/events/event-sunday", headers=auth(member), json=event_payload()).status_code == 403
    assert client.delete("/api/collaboration/events/event-sunday", headers=auth(member)).status_code == 403
    assert client.get("/api/collaboration/events/event-sunday", headers=auth(outsider)).status_code == 403

    personal = client.put(
        "/api/collaboration/events/event-sunday/repertoire/item-one/personal",
        headers=auth(member),
        json={"title": "Minha versão", "artist": "Equipe", "key": "A", "capo": "0", "chordSheet": "Verso\nA D E", "notes": "Somente para minha voz"},
    )
    assert personal.status_code == 200, personal.get_json()
    member_item = personal.get_json()["repertoire"][0]
    assert member_item["personal"]["key"] == "A"
    assert member_item["personal"]["title"] == "Minha versão"
    assert member_item["personal"]["chordSheet"] == "Verso\nA D E"
    assert member_item["shared"]["key"] == "G"

    leader_view = client.get("/api/collaboration/events/event-sunday", headers=auth(leader)).get_json()
    assert leader_view["repertoire"][0]["personal"] is None
    assert leader_view["repertoire"][0]["shared"]["key"] == "G"

    shared = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"remoteVersion": leader_view["remoteVersion"], "title": "Novo título oficial", "artist": "Banda", "key": "D", "capo": "1", "chordSheet": "Refrão\nD G A", "notes": "Novo oficial"},
    )
    assert shared.status_code == 200, shared.get_json()
    member_view = client.get("/api/collaboration/events/event-sunday", headers=auth(member)).get_json()
    assert member_view["repertoire"][0]["shared"]["key"] == "D"
    assert member_view["repertoire"][0]["shared"]["title"] == "Novo título oficial"
    assert member_view["repertoire"][0]["shared"]["chordSheet"] == "Refrão\nD G A"
    assert member_view["repertoire"][0]["personal"]["key"] == "A"

    with app.app_context():
        assert Event.query.count() == 1
        assert EventMember.query.count() == 2
        assert EventRepertoireItem.query.count() == 2
        assert PersonalRepertoireOverride.query.count() == 1


def test_leader_can_reorder_transfer_leadership_and_remove_event(client):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    created = client.post("/api/collaboration/events", headers=auth(leader), json=event_payload()).get_json()

    update = {**created, "leaderId": "member-user"}
    update["repertoire"] = list(reversed(update["repertoire"]))
    transferred = client.put("/api/collaboration/events/event-sunday", headers=auth(leader), json=update)
    assert transferred.status_code == 200, transferred.get_json()
    body = transferred.get_json()
    assert body["leaderId"] == "member-user"
    assert [item["id"] for item in body["repertoire"]] == ["item-two", "item-one"]

    old_leader_denied = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"key": "F", "notes": ""},
    )
    assert old_leader_denied.status_code == 403
    assert client.delete("/api/collaboration/events/event-sunday", headers=auth(member)).status_code == 204


def test_version_conflict_does_not_overwrite_shared_repertoire(client):
    leader = register(client, "leader-user", "Líder")
    register(client, "member-user", "Integrante")
    created = client.post("/api/collaboration/events", headers=auth(leader), json=event_payload()).get_json()
    first = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"remoteVersion": created["remoteVersion"], "key": "D", "notes": "Atual"},
    )
    assert first.status_code == 200
    stale = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"remoteVersion": created["remoteVersion"], "key": "E", "notes": "Desatualizado"},
    )
    assert stale.status_code == 409
    current = client.get("/api/collaboration/events/event-sunday", headers=auth(leader)).get_json()
    assert current["repertoire"][0]["shared"]["key"] == "D"


def test_event_keeps_backend_identifier_validation_and_accepts_encoded_local_song_id(client):
    leader = register(client, "leader-user", "Líder")
    invalid = event_payload()
    invalid["members"] = [invalid["members"][0]]
    invalid["repertoire"] = [{"id": "item-local", "songId": "Na Sua Estante / Pitty", "order": 0, "shared": {}}]
    rejected = client.post("/api/collaboration/events", headers=auth(leader), json=invalid)
    assert rejected.status_code == 400
    assert rejected.get_json()["erro"]["codigo"] == "entrada_invalida"

    encoded = {**invalid, "id": "event-encoded"}
    encoded["repertoire"] = [{"id": "item-local", "songId": "scid64_TmEgU3VhIEVzdGFudGUgLyBQaXR0eQ", "order": 0, "shared": {}}]
    created = client.post("/api/collaboration/events", headers=auth(leader), json=encoded)
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["repertoire"][0]["songId"] == "scid64_TmEgU3VhIEVzdGFudGUgLyBQaXR0eQ"


def test_unregistered_members_and_invalid_versions_are_rejected(client):
    leader = register(client, "leader-user", "Líder")
    payload = event_payload()
    missing_member = client.post("/api/collaboration/events", headers=auth(leader), json=payload)
    assert missing_member.status_code == 400
    assert missing_member.get_json()["erro"]["codigo"] == "membro_nao_registrado"

    register(client, "member-user", "Integrante")
    created = client.post("/api/collaboration/events", headers=auth(leader), json=payload)
    assert created.status_code == 201
    invalid_version = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"remoteVersion": "não-numérica", "key": "D", "notes": ""},
    )
    assert invalid_version.status_code == 400
    assert invalid_version.get_json()["erro"]["codigo"] == "entrada_invalida"
    missing_item = client.delete(
        "/api/collaboration/events/event-sunday/repertoire/item-inexistente/personal",
        headers=auth(leader),
    )
    assert missing_item.status_code == 404
