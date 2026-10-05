import pytest
from sqlalchemy.exc import IntegrityError

from app.database import db
from app.models import UserHandle
from test_event_permissions import auth
from test_event_invitations import create_leader_event

BASE = '/api/collaboration'


def test_username_unique_case_insensitive_and_immutable(client, app):
    create_leader_event(client, app)
    headers = auth('signed-leader-user')
    assert client.get(BASE+'/me/username',headers=headers).get_json()=={'username':None}
    assert client.get(BASE+'/usernames/availability?username=Musico_123',headers=headers).get_json()['available'] is True
    created=client.post(BASE+'/me/username',headers=headers,json={'username':' Musico_123 '})
    assert created.status_code==201 and created.get_json()['username']=='musico_123'
    assert client.get(BASE+'/usernames/availability?username=MUSICO_123',headers=auth('signed-member-user')).get_json()['available'] is False
    assert client.post(BASE+'/me/username',headers=auth('signed-member-user'),json={'username':'musico_123'}).status_code==409
    assert client.post(BASE+'/me/username',headers=headers,json={'username':'new_username'}).get_json()['erro']['codigo']=='nome_usuario_fixo'
    assert client.post(BASE+'/me/username',headers=headers,json={'username':'musico_123'}).status_code==200
    assert client.get(BASE+'/me/username',headers=headers).get_json()['username']=='musico_123'
    with app.app_context():
        assert UserHandle.query.count()==1
        db.session.add(UserHandle(user_id='member-user',username='musico_123'))
        with pytest.raises(IntegrityError):db.session.commit()
        db.session.rollback()


def test_username_requires_account_and_valid_syntax(client, app):
    create_leader_event(client, app)
    local=client.post(BASE+'/users',json={'id':'guest-handle','name':'Guest'}).get_json()['accessToken']
    for path in ['/me/username','/usernames/availability?username=valid_name']:
        assert client.get(BASE+path).status_code==401
        assert client.get(BASE+path,headers=auth(local)).status_code==403
    assert client.post(BASE+'/me/username',headers=auth(local),json={'username':'valid_name'}).status_code==403
    for name in ['ab','a'*25,'ácento','with space','name<script>','roudy','ADMIN','',None]:
        assert client.get(BASE+'/usernames/availability',query_string={'username':name},headers=auth('signed-leader-user')).status_code==400
        assert client.post(BASE+'/me/username',json={'username':name},headers=auth('signed-leader-user')).status_code==400


def test_username_search_and_separation_from_name(client, app):
    create_leader_event(client, app)
    client.get(BASE+'/me',headers=auth('signed-member-user'))
    assert client.post(BASE+'/me/username',json={'username':'ana_guitar'},headers=auth('signed-member-user')).status_code==201
    data=client.get(BASE+'/directory/users?q=@ana_gu',headers=auth('signed-leader-user')).get_json()['users']
    assert len(data)==1 and data[0]['username']=='ana_guitar' and data[0]['name']=='member-user'
    for term in ['ana_gu', '@ANA_GU', 'ana_guitar', 'member-user']:
        users=client.get(BASE+'/directory/users',query_string={'q':term},headers=auth('signed-leader-user')).get_json()['users']
        assert len(users)==1 and users[0]['username']=='ana_guitar'
    assert client.get(BASE+'/directory/users?q=@@',headers=auth('signed-leader-user')).get_json()['users']==[]
