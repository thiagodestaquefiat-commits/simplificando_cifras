"""Avisos legados recebem ACK sem ocupar banco/fila; conversas mantêm o contrato."""
import pytest
from app.database import db
from app.models import Event, EventMessage, EventChange
from app.models.playlist_collaboration import PlaylistNotification
from test_event_permissions import register, auth, event_payload

URL="/api/collaboration/events/event-sunday/messages"


@pytest.fixture
def actors(client):
    leader=register(client,"leader-user","Líder")
    member=register(client,"member-user","Integrante")
    outsider=register(client,"outsider-user","Visitante")
    assert client.post("/api/collaboration/events",headers=auth(leader),json=event_payload()).status_code==201
    return leader,member,outsider


def test_system_requests_are_acknowledged_without_any_persistent_notice(client,app,actors):
    _,member,_=actors
    with app.app_context():
        initial=(EventMessage.query.count(),EventChange.query.count(),PlaylistNotification.query.count(),db.session.get(Event,"event-sunday").version)
    for index in range(12):
        body={"clientId":f"legacy-notice-{index}","type":"system","content":"Alterou o tom oficial para C#."}
        for _ in range(2):
            response=client.post(URL,headers=auth(member),json=body)
            assert response.status_code==200
            ack=response.get_json()
            assert ack["id"]==body["clientId"] and ack["type"]=="system"
            assert ack["ignored"] is True and ack["deleted"] is True
            assert ack["content"]=="" and not ack.get("pending")
    assert client.get(URL,headers=auth(member)).get_json()["messages"]==[]
    with app.app_context():
        assert (EventMessage.query.count(),EventChange.query.count(),PlaylistNotification.query.count(),db.session.get(Event,"event-sunday").version)==initial


def test_ack_does_not_block_the_next_real_message(client,actors):
    leader,member,_=actors
    ack=client.post(URL,headers=auth(member),json={"clientId":"old-notice","type":"system","content":"Atualizou o evento."})
    assert ack.status_code==200
    text={"clientId":"conversation-after-notice","type":"text","content":"Vamos ensaiar às 19h?"}
    assert client.post(URL,headers=auth(member),json=text).status_code==201
    assert client.post(URL,headers=auth(member),json=text).status_code==200
    messages=client.get(URL,headers=auth(leader)).get_json()["messages"]
    assert len(messages)==1 and messages[0]["content"]==text["content"]


def test_system_compatibility_keeps_membership_and_id_protection(client,app,actors):
    leader,member,outsider=actors
    body={"clientId":"protected-id","type":"system"}
    assert client.post(URL,json=body).status_code==401
    assert client.post(URL,headers=auth(outsider),json=body).status_code==403
    assert client.post(URL,headers=auth(leader),json={**body,"type":"text","content":"Mensagem real"}).status_code==201
    assert client.post(URL,headers=auth(member),json=body).status_code==409
    assert client.post(URL,headers=auth(leader),json=body).status_code==409
    with app.app_context():
        assert db.session.get(EventMessage,body["clientId"]).content=="Mensagem real"


def test_legacy_stored_notices_are_hidden_and_cannot_be_reactivated(client,app,actors):
    leader,_,_=actors
    with app.app_context():
        db.session.add(EventMessage(id="historical-system",event_id="event-sunday",sender_id="leader-user",sender_name="Líder",message_type="system",content="Histórico preservado"))
        db.session.commit()
    response=client.post(URL,headers=auth(leader),json={"clientId":"historical-system","type":"system","content":"Não reenviar"})
    assert response.status_code==200 and response.get_json()["content"]==""
    for action in ({"action":"react","emoji":"👍"},{"action":"edit","content":"Novo"},{"action":"delete"}):
        assert client.patch(URL+"/historical-system",headers=auth(leader),json=action).status_code==404
    assert client.get(URL,headers=auth(leader)).get_json()["messages"]==[]
    with app.app_context():
        assert EventMessage.query.count()==1
        assert db.session.get(EventMessage,"historical-system").content=="Histórico preservado"


def test_event_updates_still_go_to_notifications_not_chat(client,app,actors):
    leader,_,_=actors
    event=client.get("/api/collaboration/events/event-sunday",headers=auth(leader)).get_json()
    event["title"]="Ensaio atualizado"
    response=client.put("/api/collaboration/events/event-sunday",headers=auth(leader),json=event)
    assert response.status_code==200
    assert response.get_json()["notifications"]
    assert client.get(URL,headers=auth(leader)).get_json()["messages"]==[]
    with app.app_context():
        assert EventChange.query.count()>0
        assert EventMessage.query.count()==0
