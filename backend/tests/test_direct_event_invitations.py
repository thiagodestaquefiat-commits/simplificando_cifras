from datetime import datetime, timedelta, timezone

from app.database import db
from app.models import CollaborationUser, DirectEventInvitation, Event, EventMember, ExternalIdentity
from test_event_permissions import auth
from test_event_invitations import create_leader_event


BASE = "/api/collaboration"


def setup(client, app):
    create_leader_event(client, app)
    for person in ("member-user", "outsider"):
        assert client.get(BASE + "/me", headers=auth("signed-" + person)).status_code == 200


def invite(client, target="member-user", actor="leader-user", role="Vocal"):
    return client.post(BASE + "/events/event-sunday/direct-invitations", headers=auth("signed-" + actor),
                       json={"userId": target, "role": role})


def reply(client, invitation, actor="member-user", action="accept"):
    return client.post(BASE + f"/direct-invitations/{invitation}/respond", headers=auth("signed-" + actor), json={"action": action})


def test_directory_only_public_registered_profiles_and_pagination(client, app):
    setup(client, app)
    client.post(BASE + "/users", json={"id": "local-person", "name": "Teste local"})
    with app.app_context():
        for i in range(25):
            user = CollaborationUser(id=f"test-user-{i:03}", name="Teste homônimo", avatar_url="javascript:alert(1)")
            db.session.add(user)
            db.session.add(ExternalIdentity(provider="supabase", subject=user.id, user_id=user.id))
        user = CollaborationUser(id="email-name-user", name="Teste@example.com")
        db.session.add(user)
        db.session.add(ExternalIdentity(provider="supabase", subject=user.id, user_id=user.id))
        db.session.commit()
    first = client.get(BASE + "/directory/users?q=Teste", headers=auth("signed-leader-user")).get_json()
    assert len(first["users"]) == 20 and first["nextOffset"] == 20
    assert all(set(user) == {"id", "name", "avatarUrl", "username"} and user["avatarUrl"] is None for user in first["users"])
    second = client.get(BASE + "/directory/users?q=Teste&offset=20", headers=auth("signed-leader-user")).get_json()
    assert len(second["users"]) == 5 and second["nextOffset"] is None
    assert client.get(BASE + "/directory/users?q=T", headers=auth("signed-leader-user")).get_json()["users"] == []
    assert client.get(BASE + "/directory/users?q=%25%25", headers=auth("signed-leader-user")).get_json()["users"] == []
    assert client.get(BASE + "/directory/users?q=Te&offset=-1", headers=auth("signed-leader-user")).status_code == 400
    assert client.get(BASE + "/directory/users?q=Teste").status_code == 401


def test_invite_accept_is_private_idempotent_and_nonleader(client, app):
    setup(client, app)
    created = invite(client)
    assert created.status_code == 201, created.get_json()
    invitation = created.get_json()["id"]
    assert invite(client).status_code == 409
    assert client.get(BASE + "/events/event-sunday", headers=auth("signed-member-user")).status_code == 403
    inbox = client.get(BASE + "/direct-invitations", headers=auth("signed-member-user")).get_json()["invitations"]
    assert inbox[0]["eventTitle"] and inbox[0]["inviter"]["name"] == "leader-user"
    assert "email" not in str(inbox)
    assert client.get(BASE + "/direct-invitations", headers=auth("signed-outsider")).get_json()["invitations"] == []
    assert reply(client, invitation, "outsider").status_code == 404
    accepted = reply(client, invitation)
    assert accepted.status_code == 200, accepted.get_json()
    assert accepted.get_json()["event"]["permissions"]["canEditShared"] is False
    assert reply(client, invitation).status_code == 200
    assert reply(client, invitation, action="reject").status_code == 409
    assert invite(client).status_code == 409
    with app.app_context():
        assert EventMember.query.filter_by(event_id="event-sunday", user_id="member-user").count() == 1
        assert db.session.get(Event, "event-sunday").leader_id == "leader-user"


def test_reject_and_reissue_uses_new_id(client, app):
    setup(client, app)
    invitation = invite(client).get_json()["id"]
    assert reply(client, invitation, action="reject").status_code == 200
    assert reply(client, invitation, action="reject").status_code == 200
    assert client.get(BASE + "/events/event-sunday", headers=auth("signed-member-user")).status_code == 403
    new_id = invite(client).get_json()["id"]
    assert new_id != invitation
    assert reply(client, invitation).status_code == 404
    assert reply(client, new_id).status_code == 200


def test_permissions_roles_guests_and_expiry(client, app):
    setup(client, app)
    assert invite(client, actor="outsider").status_code == 403
    assert invite(client, target="leader-user").status_code == 409
    assert invite(client, role="Liderança").status_code == 400
    assert invite(client, target="unknown-user").status_code == 404
    local = client.post(BASE + "/users", json={"id": "guest-test", "name": "Guest"}).get_json()["accessToken"]
    assert client.get(BASE + "/directory/users?q=Te", headers=auth(local)).status_code == 403
    assert client.get(BASE + "/direct-invitations", headers=auth(local)).status_code == 403
    invitation = invite(client).get_json()["id"]
    assert client.post(BASE + f"/direct-invitations/{invitation}/respond", headers=auth(local), json={"action": "accept"}).status_code == 403
    assert reply(client, invitation, action="anything").status_code == 400
    with app.app_context():
        row = db.session.get(DirectEventInvitation, invitation)
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.session.commit()
    assert reply(client, invitation).status_code == 410
    assert client.get(BASE + "/direct-invitations", headers=auth("signed-member-user")).get_json()["invitations"] == []


def test_old_leader_invitation_becomes_invalid(client, app):
    setup(client, app)
    invitation = invite(client).get_json()["id"]
    with app.app_context():
        event = db.session.get(Event, "event-sunday")
        event.leader_id = "outsider"
        db.session.add(EventMember(event_id=event.id, user_id="outsider", name="outsider", role="Liderança"))
        db.session.commit()
    assert reply(client, invitation).status_code == 410
    assert client.get(BASE + "/direct-invitations", headers=auth("signed-member-user")).get_json()["invitations"] == []


def test_direct_invitation_to_band_is_member_only(client, app):
    create_leader_event(client, app, band=True)
    client.get(BASE + "/me", headers=auth("signed-member-user"))
    invitation = invite(client).get_json()["id"]
    assert reply(client, invitation).status_code == 200
    from app.models import BandMember
    with app.app_context():
        member = BandMember.query.filter_by(band_id="band-team", user_id="member-user").one()
        assert member.access_role == "member"
