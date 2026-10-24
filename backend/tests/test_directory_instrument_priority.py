from urllib.parse import urlencode

from app.database import db
from app.models import CollaborationUser, ExternalIdentity, ProfileInstrument, UserHandle
from test_event_invitations import create_leader_event
from test_event_permissions import auth

BASE = "/api/collaboration"


def directory(client, **params):
    response = client.get(BASE + "/directory/users?" + urlencode(params), headers=auth("signed-leader-user"))
    assert response.status_code == 200, response.json
    return response.json


def test_priority_precedes_pagination_without_hiding_other_people(client, app):
    create_leader_event(client, app)
    with app.app_context():
        for i in range(25):
            uid = f"musician-{i:02}"
            db.session.add(CollaborationUser(id=uid, name=f"Ana {i:02}"))
            db.session.flush()
            db.session.add(ExternalIdentity(provider="supabase", subject=uid, user_id=uid))
            # Os três primeiros alfabeticamente não tocam guitarra.
            if i >= 3:
                db.session.add(ProfileInstrument(user_id=uid, instrument="guitarra"))
            if i == 24:
                db.session.add(ProfileInstrument(user_id=uid, instrument="baixo"))
                db.session.add(UserHandle(user_id=uid, username="ana_unica"))
        db.session.commit()
    ordinary = directory(client, q="Ana")
    assert ordinary["users"][0]["id"] == "musician-00"
    first = directory(client, q="Ana", role="Guitarra")
    second = directory(client, q="Ana", role="Guitarra", offset=first["nextOffset"])
    assert [p["id"] for p in first["users"] + second["users"]] == [f"musician-{i:02}" for i in list(range(3, 25)) + [0, 1, 2]]
    assert second["nextOffset"] is None
    assert all(set(p) == {"id", "name", "avatarUrl", "username"} for p in first["users"])
    assert directory(client, q="@ana_unica", role="Violão")["users"][0]["id"] == "musician-24"
    assert directory(client, q="Ana", role="baixista")["users"][0]["id"] == "musician-24"
    for role in ("Outra", "instrumento desconhecido", "Violão", "Vocal"):
        assert directory(client, q="Ana", role=role) == ordinary
    assert directory(client, q="ZZ", role="Guitarra")["users"] == []


def test_index_follows_authenticated_profile_not_event_role(client, app):
    create_leader_event(client, app)

    class ProfileAuth:
        instruments = ["Violão", "violonista", "BÁIXO", "Vocal", "Backing Vocal", "lixo"]

        def validate(self, token):
            return {"id": "profile-subject", "user_metadata": {"full_name": "Ana", "instruments": self.instruments}}

    provider = ProfileAuth()
    app.extensions["supabase_auth"] = provider
    with app.app_context():
        db.session.add(CollaborationUser(id="profile-internal", name="Ana"))
        db.session.flush()
        db.session.add(ExternalIdentity(provider="supabase", subject="profile-subject", user_id="profile-internal"))
        db.session.commit()
    headers = auth("profile-token")

    def indexed():
        assert client.get(BASE + "/me", headers=headers).status_code == 200
        with app.app_context():
            return {row.instrument for row in ProfileInstrument.query.filter_by(user_id="profile-internal").all()}

    assert indexed() == {"violao", "baixo", "vocal", "backing vocal"}
    provider.instruments = ["Guitarra", "Ukulele", "Violino"]
    assert indexed() == {"guitarra", "ukulele", "violino"}
    provider.instruments = "Guitarra"  # Payload inválido não remove um perfil válido.
    assert indexed() == {"guitarra", "ukulele", "violino"}
    provider.instruments = []
    assert indexed() == set()
