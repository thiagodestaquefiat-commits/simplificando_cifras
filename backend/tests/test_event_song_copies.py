from copy import deepcopy

from app.database import db
from app.models import PersonalSong, SharedSong
from test_event_permissions import auth, event_payload, register


def test_event_snapshot_and_personal_changes_never_write_song_catalogs(client, app):
    leader=register(client,'leader-user','Líder')
    member=register(client,'member-user','Integrante')
    outsider=register(client,'other-user','Fora')
    payload=event_payload()
    song={'id':'song-1','title':'Cópia original','key':'G','blocos':[{'l':'Verso','c':'G C D'}],
          'fullChordSheet':{'content':'G C D\nLetra'},'playbackSettings':{'bpm':96,'capo':2},'accessToken':'discard-me'}
    payload['repertoire'][0]['shared']['songData']=song
    created=client.post('/api/collaboration/events',headers=auth(leader),json=payload)
    assert created.status_code==201
    snapshot=created.get_json()['repertoire'][0]['shared']['songData']
    assert snapshot['title']=='Cópia original' and 'accessToken' not in snapshot
    changed=deepcopy(snapshot);changed['title']='Somente neste evento';changed['playbackSettings']['bpm']=111
    changes={'title':changed['title'],'key':'A','capo':'4','chordSheet':'A D E','songData':changed}
    url='/api/collaboration/events/event-sunday/repertoire/item-one/personal'
    assert client.put(url,headers=auth(outsider),json=changes).status_code==403
    saved=client.put(url,headers=auth(member),json=changes)
    assert saved.status_code==200 and saved.get_json()['repertoire'][0]['personal']['songData']['playbackSettings']['bpm']==111
    leader_view=client.get('/api/collaboration/events/event-sunday',headers=auth(leader)).get_json()
    assert leader_view['repertoire'][0]['personal'] is None
    assert leader_view['repertoire'][0]['shared']['songData']==snapshot
    assert client.get('/api/collaboration/capabilities').get_json()['eventSongData']==1
    with app.app_context():
        assert PersonalSong.query.count()==0 and SharedSong.query.count()==0


def test_bad_snapshot_is_rejected(client):
    leader=register(client,'leader-user','Líder');register(client,'member-user','Integrante')
    for value in ['not-json',{'playbackSettings':{'bpm':100}}]:
        payload=event_payload();payload['repertoire'][0]['shared']['songData']=value
        assert client.post('/api/collaboration/events',headers=auth(leader),json=payload).status_code==400
