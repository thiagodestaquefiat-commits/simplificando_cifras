"""Excluir conta (Play Store / LGPD, decisão de 04/11/2026)."""
from copy import deepcopy

from app.database import db
from app.models import (CollaborationUser, Event, EventMember, EventMessage, PersonalPlaylist, PersonalSong,
                        SharedSong, UserAccessToken)
from test_event_permissions import auth, event_payload, register
from test_shared_songs import ai_song


def delete(client, token, confirm="EXCLUIR"):
    return client.delete("/api/account", headers=auth(token), json={"confirm": confirm})


def test_requires_login_and_typed_confirmation(client):
    assert client.delete("/api/account", json={"confirm": "EXCLUIR"}).status_code == 401
    token = register(client, "conf-user", "Pessoa")
    response = delete(client, token, "sim")
    assert response.status_code == 400
    assert response.get_json()["erro"]["codigo"] == "confirmacao_necessaria"
    assert client.get("/api/collaboration/me", headers=auth(token)).status_code == 200, "nada foi apagado"


def test_member_deletes_account_and_leader_event_survives(client, app):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    assert client.post("/api/collaboration/events", headers=auth(leader), json=event_payload()).status_code == 201
    client.post("/api/collaboration/events/event-sunday/messages", headers=auth(member),
                json={"clientId": "m1", "type": "text", "content": "Olá, equipe!"})
    client.put("/api/library/songs/s1", headers=auth(member), json={"songData": ai_song()})
    client.put("/api/personal-playlists/p1", headers=auth(member), json={"playlistData": {"id": "p1", "name": "Domingo", "items": []}})

    response = delete(client, member)
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["deleted"] is True

    assert client.get("/api/collaboration/me", headers=auth(member)).status_code == 401, "o acesso antigo não vale mais"
    with app.app_context():
        assert db.session.get(CollaborationUser, "member-user") is None
        assert UserAccessToken.query.filter_by(user_id="member-user").count() == 0
        assert PersonalSong.query.filter_by(owner_user_id="member-user").count() == 0
        assert PersonalPlaylist.query.filter_by(owner_user_id="member-user").count() == 0
        assert Event.query.count() == 1, "o evento é do líder e continua"
        assert EventMember.query.filter_by(user_id="member-user").count() == 0
        message = EventMessage.query.one()
        assert message.sender_name == "Conta excluída" and message.sender_avatar_url is None
        song = SharedSong.query.one()
        assert song.contributed_by is None, "a música fica no catálogo, sem o nome de quem enviou"
    view = client.get("/api/collaboration/events/event-sunday", headers=auth(leader))
    assert view.status_code == 200
    assert [item["id"] for item in view.get_json()["members"]] == ["leader-user"]


def test_leader_deletes_account_and_owned_event_goes_too(client, app):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    assert client.post("/api/collaboration/events", headers=auth(leader), json=event_payload()).status_code == 201
    client.post("/api/collaboration/events/event-sunday/messages", headers=auth(member),
                json={"clientId": "m1", "type": "text", "content": "Até domingo"})
    other = deepcopy(event_payload())
    other.update(id="event-member", leaderId="member-user",
                 members=[{"id": "member-user", "name": "Integrante", "role": "Vocal"}, {"id": "leader-user", "name": "Líder", "role": "Violão"}],
                 repertoire=[{"id": "item-member", "songId": "song-9", "order": 0, "shared": {"title": "Outra", "key": "D"}}])
    assert client.post("/api/collaboration/events", headers=auth(member), json=other).status_code == 201

    assert delete(client, leader).status_code == 200
    with app.app_context():
        assert db.session.get(Event, "event-sunday") is None, "evento de que era dono é apagado"
        assert EventMessage.query.filter_by(event_id="event-sunday").count() == 0
        assert EventMember.query.filter_by(event_id="event-sunday").count() == 0
        assert db.session.get(Event, "event-member") is not None, "evento de outra pessoa continua"
        assert EventMember.query.filter_by(event_id="event-member", user_id="leader-user").count() == 0
    assert client.get("/api/collaboration/events/event-member", headers=auth(member)).status_code == 200


def test_deleting_twice_is_harmless(client):
    token = register(client, "twice-user", "Pessoa")
    assert delete(client, token).status_code == 200
    assert delete(client, token).status_code == 401


def test_supabase_login_is_deleted_with_new_or_legacy_key(app, monkeypatch):
    from app.services import account_deletion
    sent = []

    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): return False

    monkeypatch.setattr(account_deletion, "urlopen", lambda request, timeout: sent.append(request) or Response())
    with app.app_context():
        app.config.update(SUPABASE_URL="https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY="")
        assert account_deletion.delete_supabase_user("abc") is False, "sem chave não tenta"
        app.config["SUPABASE_SERVICE_ROLE_KEY"] = "sb_secret_novo"
        assert account_deletion.delete_supabase_user("abc") is True
        assert sent[-1].full_url == "https://proj.supabase.co/auth/v1/admin/users/abc" and sent[-1].get_method() == "DELETE"
        assert sent[-1].get_header("Apikey") == "sb_secret_novo" and sent[-1].get_header("Authorization") is None
        app.config["SUPABASE_SERVICE_ROLE_KEY"] = "eyJ.legacy.jwt"
        assert account_deletion.delete_supabase_user("abc") is True
        assert sent[-1].get_header("Authorization") == "Bearer eyJ.legacy.jwt"
