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
