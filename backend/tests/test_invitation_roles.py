import pytest

from test_event_invitations import create_leader_event
from test_event_permissions import auth


ROLES = ['Vocal', 'Backing Vocal', 'Guitarra', 'Violão', 'Baixo', 'Bateria', 'Teclado', 'Percussão', 'Áudio', 'Ukulele', 'Cavaco', 'Viola Caipira', 'Violino', 'Outros', 'Outra']


@pytest.mark.parametrize('role', ROLES)
def test_shared_link_keeps_role_and_uses_recipient_name(client, app, role):
    create_leader_event(client, app)
    created = client.post('/api/collaboration/events/event-sunday/invitations', headers=auth('signed-leader-user'), json={'role': role})
    assert created.status_code == 201, created.json
    assert created.json['role'] == role
    joined = client.post('/api/collaboration/invitations/' + created.json['token'] + '/accept', headers=auth('signed-member-user'))
    assert joined.status_code == 200, joined.json
    member = next(item for item in joined.json['members'] if item['id'] == 'member-user')
    assert member['role'] == role
    assert member['name'] == 'member-user'
    assert member['isLeader'] is False
    assert joined.json['leaderId'] == 'leader-user'
    assert joined.json['permissions']['canEditShared'] is False


@pytest.mark.parametrize('role', ROLES)
def test_search_invitation_keeps_role_after_acceptance(client, app, role):
    create_leader_event(client, app)
    assert client.get('/api/collaboration/me', headers=auth('signed-member-user')).status_code == 200
    created = client.post('/api/collaboration/events/event-sunday/direct-invitations', headers=auth('signed-leader-user'), json={'userId': 'member-user', 'role': role})
    assert created.status_code == 201, created.json
    assert client.get('/api/collaboration/events/event-sunday', headers=auth('signed-member-user')).status_code == 403
    joined = client.post('/api/collaboration/direct-invitations/' + created.json['id'] + '/respond', headers=auth('signed-member-user'), json={'action': 'accept'})
    assert joined.status_code == 200, joined.json
    event = joined.json['event']
    member = next(item for item in event['members'] if item['id'] == 'member-user')
    assert member['role'] == role and member['isLeader'] is False
    assert event['permissions']['canEditShared'] is False
