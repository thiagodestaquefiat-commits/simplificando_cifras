from app.database import db
from app.models import BandMember, Event, EventInvitation, EventMember

from test_event_permissions import auth, event_payload


class FakeSupabase:
    def validate(self, token):
        if not token.startswith("signed-"):
            return None
        user_id = token.removeprefix("signed-")
        return {"id": user_id, "email": f"{user_id}@example.com", "user_metadata": {"full_name": user_id}}


def create_leader_event(client, app, band=False):
    app.extensions["supabase_auth"] = FakeSupabase()
    payload = event_payload()
    payload["members"] = [payload["members"][0]]
    if band:
        response = client.post("/api/collaboration/bands", headers=auth("signed-leader-user"),
                               json={"id": "band-team", "name": "Equipe"})
        assert response.status_code == 201, response.get_json()
        payload["bandId"] = "band-team"
    response = client.post("/api/collaboration/events", headers=auth("signed-leader-user"), json=payload)
    assert response.status_code == 201, response.get_json()


def test_invitation_joins_logged_in_member_without_leadership(client, app):
    create_leader_event(client, app, band=True)
    denied = client.post("/api/collaboration/events/event-sunday/invitations", headers=auth("signed-outsider"),
                         json={"name": "Bia", "role": "Vocal"})
    assert denied.status_code == 403
    created = client.post("/api/collaboration/events/event-sunday/invitations", headers=auth("signed-leader-user"),
                          json={"name": "Bia", "role": "Vocal"})
    assert created.status_code == 201, created.get_json()
    token = created.get_json()["token"]
    assert len(token) >= 32
    assert client.get("/api/collaboration/events/event-sunday", headers=auth("signed-member-user")).status_code == 403
    joined = client.post(f"/api/collaboration/invitations/{token}/accept", headers=auth("signed-member-user"))
    assert joined.status_code == 200, joined.get_json()
    body = joined.get_json()
    assert body["leaderId"] == body["creatorId"] == "leader-user"
    assert body["permissions"]["canEditShared"] is False
    member = next(value for value in body["members"] if value["id"] == "member-user")
    assert member["name"] == "Bia" and member["role"] == "Vocal" and member["isLeader"] is False
    assert client.post(f"/api/collaboration/invitations/{token}/accept", headers=auth("signed-member-user")).status_code == 200
    assert client.post(f"/api/collaboration/invitations/{token}/accept", headers=auth("signed-outsider")).status_code == 409
    assert client.put("/api/collaboration/events/event-sunday", headers=auth("signed-member-user"), json=body).status_code == 403
    with app.app_context():
        assert EventMember.query.filter_by(event_id="event-sunday").count() == 2
        band_member = BandMember.query.filter_by(band_id="band-team", user_id="member-user").one()
        assert band_member.access_role == "member" and band_member.musical_role == "Vocal"
        invitation = EventInvitation.query.one()
        assert invitation.token_hash != token
        assert db.session.get(Event, "event-sunday").leader_id == "leader-user"


def test_invitation_requires_google_login_and_expires(client, app):
    create_leader_event(client, app)
    local = client.post("/api/collaboration/users", json={"id": "local-guest", "name": "Convidado"}).get_json()["accessToken"]
    assert client.post("/api/collaboration/events/event-sunday/invitations", headers=auth(local), json={"name": "Ana"}).status_code == 403
    response = client.post("/api/collaboration/events/event-sunday/invitations", headers=auth("signed-leader-user"),
                           json={"name": "Ana", "role": "Baixo"})
    token = response.get_json()["token"]
    assert client.post(f"/api/collaboration/invitations/{token}/accept", headers=auth(local)).status_code == 403
    from datetime import datetime, timedelta, timezone
    with app.app_context():
        invitation = EventInvitation.query.one()
        invitation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.session.commit()
    assert client.post(f"/api/collaboration/invitations/{token}/accept", headers=auth("signed-member-user")).status_code == 410
