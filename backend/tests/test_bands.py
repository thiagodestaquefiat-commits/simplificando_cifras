from app.database import db
from app.models import Band, BandMember, Event

from test_event_permissions import auth, event_payload, register


def test_owner_creates_band_and_manages_members(client, app):
    owner = register(client, "band-owner", "Responsável")
    member = register(client, "band-member", "Musicista")
    created = client.post(
        "/api/collaboration/bands",
        headers=auth(owner),
        json={"id": "band-worship", "name": "Ministério de Louvor", "musicalRole": "Violão"},
    )
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["currentUserRole"] == "owner"
    assert created.get_json()["permissions"]["canManageMembers"] is True

    added = client.post(
        "/api/collaboration/bands/band-worship/members",
        headers=auth(owner),
        json={"userId": "band-member", "accessRole": "member", "musicalRole": "Vocal"},
    )
    assert added.status_code == 200, added.get_json()
    assert {item["id"] for item in added.get_json()["members"]} == {"band-owner", "band-member"}

    listed = client.get("/api/collaboration/bands", headers=auth(member))
    assert listed.status_code == 200
    assert listed.get_json()["bands"][0]["currentUserRole"] == "member"
    denied = client.post(
        "/api/collaboration/bands/band-worship/members",
        headers=auth(member),
        json={"userId": "band-owner", "accessRole": "member"},
    )
    assert denied.status_code == 403

    with app.app_context():
        assert Band.query.count() == 1
        assert BandMember.query.count() == 2


def test_event_can_be_linked_only_to_a_band_with_its_members(client, app):
    owner = register(client, "leader-user", "Líder")
    register(client, "member-user", "Integrante")
    client.post("/api/collaboration/bands", headers=auth(owner), json={"id": "band-team", "name": "Equipe"})
    outside_payload = event_payload()
    outside_payload["bandId"] = "band-team"
    denied = client.post("/api/collaboration/events", headers=auth(owner), json=outside_payload)
    assert denied.status_code == 400
    assert denied.get_json()["erro"]["codigo"] == "membro_fora_da_equipe"

    client.post(
        "/api/collaboration/bands/band-team/members",
        headers=auth(owner),
        json={"userId": "member-user", "accessRole": "member", "musicalRole": "Vocal"},
    )
    created = client.post("/api/collaboration/events", headers=auth(owner), json=outside_payload)
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["bandId"] == "band-team"
    with app.app_context():
        assert db.session.get(Event, "event-sunday").band_id == "band-team"


def test_auth_config_gracefully_keeps_local_mode(client):
    response = client.get("/api/auth/config")
    assert response.status_code == 200
    assert response.get_json() == {"enabled": False, "provider": "local", "supabaseUrl": "", "supabaseAnonKey": ""}


def test_supabase_login_claims_legacy_events_and_bands(client, app):
    class FakeSupabase:
        enabled = True

        def validate(self, token):
            assert token == "supabase-token"
            return {"id": "supabase-user", "email": "musico@example.com", "user_metadata": {"full_name": "Músico Conectado"}}

    legacy = register(client, "legacy-user", "Músico Local")
    client.post("/api/collaboration/bands", headers=auth(legacy), json={"id": "legacy-band", "name": "Equipe Legada"})
    app.extensions["supabase_auth"] = FakeSupabase()
    claimed = client.post(
        "/api/collaboration/identity/claim",
        headers=auth("supabase-token"),
        json={"legacyToken": legacy},
    )
    assert claimed.status_code == 200, claimed.get_json()
    assert claimed.get_json()["migrated"] is True
    bands = client.get("/api/collaboration/bands", headers=auth("supabase-token"))
    assert bands.status_code == 200
    assert bands.get_json()["bands"][0]["ownerId"] == "supabase-user"
    with app.app_context():
        assert db.session.get(Band, "legacy-band").owner_id == "supabase-user"
