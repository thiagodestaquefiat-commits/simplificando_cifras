"""Evento aberto: o app pergunta só a versão, em vez de baixar o evento inteiro."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.database import db
from app.models import UserAccessToken
from tests.test_event_permissions import auth, event_payload, register


def test_version_endpoint_returns_only_the_version_and_follows_changes(client, app):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    outsider = register(client, "outsider-user", "Visitante")
    created = client.post("/api/collaboration/events", headers=auth(leader), json=event_payload())
    assert created.status_code == 201, created.get_json()
    first = created.get_json()["remoteVersion"]

    response = client.get("/api/collaboration/events/event-sunday/version", headers=auth(member))
    assert response.status_code == 200
    assert response.get_json() == {"id": "event-sunday", "remoteVersion": first}

    changed = client.patch(
        "/api/collaboration/events/event-sunday/repertoire/item-one/shared",
        headers=auth(leader),
        json={"key": "A", "remoteVersion": first},
    )
    assert changed.status_code == 200, changed.get_json()
    after = client.get("/api/collaboration/events/event-sunday/version", headers=auth(member)).get_json()
    assert after["remoteVersion"] > first
    assert after["remoteVersion"] == client.get("/api/collaboration/events/event-sunday", headers=auth(member)).get_json()["remoteVersion"]

    assert client.get("/api/collaboration/events/event-sunday/version", headers=auth(outsider)).status_code == 403
    assert client.get("/api/collaboration/events/nao-existe/version", headers=auth(member)).status_code == 404
    assert client.get("/api/collaboration/events/event-sunday/version").status_code == 401


def test_last_used_is_written_at_most_every_ten_minutes(client, app):
    token = register(client, "leader-user", "Líder")
    register(client, "member-user", "Integrante")
    created = client.post("/api/collaboration/events", headers=auth(token), json=event_payload())
    assert created.status_code == 201, created.get_json()

    with app.app_context():
        row = UserAccessToken.query.filter_by(user_id="leader-user").first()
        recent = datetime.now(timezone.utc) - timedelta(minutes=2)
        row.last_used_at = recent
        db.session.commit()

    assert client.get("/api/collaboration/events/event-sunday/version", headers=auth(token)).status_code == 200
    with app.app_context():
        stored = UserAccessToken.query.filter_by(user_id="leader-user").first().last_used_at
        stored = stored if stored.tzinfo else stored.replace(tzinfo=timezone.utc)
        assert abs((stored - recent).total_seconds()) < 1, "uso recente não deve ser regravado"

        row = UserAccessToken.query.filter_by(user_id="leader-user").first()
        row.last_used_at = datetime.now(timezone.utc) - timedelta(minutes=30)
        db.session.commit()

    assert client.get("/api/collaboration/events/event-sunday/version", headers=auth(token)).status_code == 200
    with app.app_context():
        stored = UserAccessToken.query.filter_by(user_id="leader-user").first().last_used_at
        stored = stored if stored.tzinfo else stored.replace(tzinfo=timezone.utc)
        assert datetime.now(timezone.utc) - stored < timedelta(minutes=1), "uso antigo deve ser atualizado"
