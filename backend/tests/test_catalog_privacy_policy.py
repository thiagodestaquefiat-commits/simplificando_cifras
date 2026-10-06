from copy import deepcopy

from app.models import PersonalSong, SharedSong
from test_event_permissions import auth, register
from test_shared_songs import ai_song


def test_personal_changes_cannot_replace_or_add_catalog_entries(client, app):
    token=register(client,'privacy-a','A')
    original=ai_song()
    assert client.put('/api/library/songs/song',headers=auth(token),json={'songData':original}).status_code<300
    with app.app_context():
        before=deepcopy(SharedSong.query.one().song_data)
    edited={**original,'title':'Meu título particular','originalKey':'D','capo':5,
            'fullChordSheet':{'source':'user_upload','content':'D A\nMinha alteração privada'}}
    assert client.put('/api/library/songs/song',headers=auth(token),json={'songData':edited}).status_code<300
    with app.app_context():
        assert SharedSong.query.count()==1
        assert SharedSong.query.one().song_data==before
        assert PersonalSong.query.one().song_data['title']=='Meu título particular'


def test_new_upload_contributes_but_legacy_open_flag_never_releases_text(client, app):
    app.config['CATALOG_OPEN_CONTRIBUTION']=True
    token=register(client,'privacy-b','B')
    upload=ai_song(sourceInfo={'type':'upload'},fullChordSheet={'source':'user_upload','content':'G C\nLetra do arquivo'})
    client.put('/api/library/songs/upload',headers=auth(token),json={'songData':upload})
    client.put('/api/library/songs/text',headers=auth(token),json={'songData':ai_song(title='Texto privado',sourceInfo={'type':'text'},fullChordSheet={'source':'user_upload','content':'G C\nLetra'})})
    with app.app_context():
        assert SharedSong.query.count()==1
        assert SharedSong.query.one().song_data['fullChordSheet']['source']=='user_upload'
