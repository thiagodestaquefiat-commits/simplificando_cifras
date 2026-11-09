import io
import uuid
import wave
from app.database import db
from app.models import EventAudio
from test_event_permissions import register, auth, event_payload

URL = "/api/collaboration/events/event-sunday/messages"


def wav(seconds=1):
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(8000)
        f.writeframes(b"\0\0" * 8000 * seconds)
    return out.getvalue()


def setup(client):
    leader = register(client, "leader-user", "Líder")
    member = register(client, "member-user", "Integrante")
    outsider = register(client, "outsider", "Visitante")
    assert client.post('/api/collaboration/events', headers=auth(leader), json=event_payload()).status_code == 201
    return leader, member, outsider


def upload(client, token, message_id, raw=None):
    return client.post(URL+'/audio', headers=auth(token), data={'clientId':message_id, 'audio':(io.BytesIO(wav() if raw is None else raw),'audio.webm')})


def test_audio_private_idempotent_and_deleted(client, app):
    leader, member, outsider = setup(client)
    message_id = str(uuid.uuid4())
    assert upload(client, outsider, message_id).status_code == 403
    response = upload(client, member, message_id)
    assert response.status_code == 201, response.get_json()
    value = response.get_json()
    assert value['type']=='audio' and .9 <= value['audio']['duration'] <= 1.1
    assert value['audio']['mimeType']=='audio/mp4'
    assert upload(client, member, message_id).status_code==200
    assert upload(client, leader, message_id).status_code==409
    path=URL+'/'+message_id+'/audio'
    assert client.get(path).status_code==401
    assert client.get(path, headers=auth(outsider)).status_code==403
    data=client.get(path, headers=auth(leader))
    assert data.status_code==200 and data.mimetype=='audio/mp4'
    assert b'ftyp' in data.data[:40] and data.headers['Cache-Control']=='private, no-store'
    assert upload(client,member,str(uuid.uuid4()),data.data).status_code==201, 'MP4/AAC também é aceito na entrada'
    assert client.patch(URL+'/'+message_id, headers=auth(leader), json={'action':'delete'}).status_code==403
    assert client.patch(URL+'/'+message_id, headers=auth(member), json={'action':'delete'}).status_code==200
    assert client.get(path, headers=auth(member)).status_code==404
    with app.app_context():
        assert db.session.get(EventAudio, message_id) is None


def test_invalid_audio_and_forgery(client):
    leader, _, _=setup(client)
    assert upload(client,leader,str(uuid.uuid4()),b'<script>bad</script>').status_code==400
    assert upload(client,leader,'invalid',wav()).status_code==400
    assert client.post(URL,headers=auth(leader),json={'type':'audio','content':'fake'}).status_code==400
    assert upload(client,leader,str(uuid.uuid4()),b'x'*(3*1024*1024+1)).status_code in (413,400)


def test_duration_checked_on_server():
    import pytest
    from app.errors import ApiError
    from app.services.chat_audio import normalize_audio
    with pytest.raises(ApiError):
        normalize_audio(wav(91))


def test_long_audio_and_aac_boundary(client, app):
    from app.services.chat_audio import normalize_audio
    import math
    import struct
    app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 + 65536
    leader, _, _ = setup(client)
    for seconds in (80, 90):
        raw = io.BytesIO()
        with wave.open(raw, 'wb') as output:
            output.setparams((1, 2, 8000, 0, 'NONE', ''))
            second = b''.join(struct.pack('<h', int(9000 * math.sin(2 * math.pi * 440 * i / 8000))) for i in range(8000))
            output.writeframes(second * seconds)
        encoded, _ = normalize_audio(raw.getvalue())
        assert len(encoded) > 65535
        message_id = str(uuid.uuid4())
        response = upload(client, leader, message_id, encoded)
        assert response.status_code == 201, response.json
        assert response.json['audio']['duration'] == seconds
        response = client.get(URL+'/'+message_id+'/audio', headers=auth(leader))
        assert response.status_code == 200 and len(response.data) > 65535


def test_schema_storage_dialects():
    from sqlalchemy.dialects import mysql, postgresql
    assert EventAudio.data.type.compile(dialect=mysql.dialect()) == 'MEDIUMBLOB'
    assert EventAudio.data.type.compile(dialect=postgresql.dialect()) == 'BYTEA'


def test_audio_migration_only_widens_legacy_blob(monkeypatch):
    from contextlib import nullcontext
    from types import SimpleNamespace
    from sqlalchemy.dialects.mysql import BLOB, MEDIUMBLOB
    from app import database
    statements = []
    connection = SimpleNamespace(dialect=SimpleNamespace(name='mysql'), execute=lambda sql: statements.append(str(sql)))
    column = {'name': 'data', 'type': BLOB()}
    inspector = SimpleNamespace(get_table_names=lambda: ['event_audio'], get_columns=lambda _: [column])
    monkeypatch.setattr(database, 'inspect', lambda _: inspector)
    monkeypatch.setattr(database, 'db', SimpleNamespace(engine=SimpleNamespace(begin=lambda: nullcontext(connection))))
    database.ensure_additive_collaboration_columns()
    assert statements == ['ALTER TABLE event_audio MODIFY COLUMN data MEDIUMBLOB NOT NULL']
    column['type'] = MEDIUMBLOB()
    database.ensure_additive_collaboration_columns()
    connection.dialect.name = 'postgresql'
    column['type'] = BLOB()
    database.ensure_additive_collaboration_columns()
    assert len(statements) == 1


def test_storage_error_is_safe_and_rolled_back(client, app, monkeypatch):
    from sqlalchemy.exc import DataError
    leader, _, _ = setup(client)
    message_id = str(uuid.uuid4())
    def fail():
        raise DataError('fake write', {'bytes': b'private'}, ValueError('simulated'))
    monkeypatch.setattr(db.session, 'commit', fail)
    response = upload(client, leader, message_id)
    assert response.status_code == 503
    assert response.json['erro']['codigo'] == 'audio_armazenamento'
    assert 'private' not in response.get_data(as_text=True)
    with app.app_context():
        assert db.session.get(EventAudio, message_id) is None
