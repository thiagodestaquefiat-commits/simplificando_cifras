"""Força-tarefa (out/2026): música adicionada ou completada vai ao catálogo; ajuste pessoal não sobrescreve o catálogo."""
from copy import deepcopy

from app.models import PersonalSong, SharedSong
from test_event_permissions import auth, register
from test_shared_songs import ai_song


def test_personal_edits_never_overwrite_a_complete_catalog_song(client, app):
    token=register(client,'privacy-a','A')
    original=ai_song(fullChordSheet={'source':'user_upload','content':'G C\nLetra do arquivo'})
    assert client.put('/api/library/songs/song',headers=auth(token),json={'songData':original}).status_code<300
    with app.app_context():
        before=deepcopy(SharedSong.query.one().song_data)
    edited={**original,'title':'Meu título particular','originalKey':'D','capo':5,
            'fullChordSheet':{'source':'user_upload','content':'D A\nMinha alteração'}}
    assert client.put('/api/library/songs/song',headers=auth(token),json={'songData':edited}).status_code<300
    with app.app_context():
        assert SharedSong.query.count()==1
        assert SharedSong.query.one().song_data==before
        assert PersonalSong.query.one().song_data['title']=='Meu título particular'


def test_upload_and_text_songs_both_go_to_the_shared_catalog(client, app):
    token=register(client,'privacy-b','B')
    upload=ai_song(sourceInfo={'type':'upload'},fullChordSheet={'source':'user_upload','content':'G C\nLetra do arquivo'})
    client.put('/api/library/songs/upload',headers=auth(token),json={'songData':upload})
    client.put('/api/library/songs/text',headers=auth(token),json={'songData':ai_song(title='Digitada',sourceInfo={'type':'text'},fullChordSheet={'source':'user_text','content':'G C\nLetra'})})
    with app.app_context():
        sources={song.title:song.song_data['fullChordSheet']['source'] for song in SharedSong.query.all()}
    assert sources=={'Asa Branca':'user_upload','Digitada':'user_text'}
