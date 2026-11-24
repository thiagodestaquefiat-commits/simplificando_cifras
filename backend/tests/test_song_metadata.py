from app.services.song_metadata import repair_song, repair_tree


def song():
    return {"title":"Primeira essência","artist":"", "playbackSettings":{"bpm":90},
            "fullChordSheet":{"source":"web_source","content":"Composição de: Anderson Freire\n[Ritmo Padrão]\n75 bpm\n[Intro]\nC G\nLetra original",
              "sections":[{"nome":None,"linhas":[{"letra":"Composição de: Anderson Freire","acordes":[]}]},
                          {"nome":"Ritmo Padrão","linhas":[{"letra":"75 bpm","acordes":[]}]},
                          {"nome":"Intro","linhas":[{"letra":"Letra original","acordes":[{"acorde":"C","posicao":0}]}]}]}}


def test_explicit_metadata_preserves_source_and_preferences():
    source=song();result=repair_song(source)
    assert result["bpm"]==75 and result["composer"]=="Anderson Freire"
    assert result["artist"]==""
    assert result["playbackSettings"]["bpm"]==90
    assert result["bpmSource"]=={"kind":"explicit_sheet","value":75,"evidence":"75 bpm","sourceType":"web_source"}
    assert result["fullChordSheet"]["sourceContent"]==source["fullChordSheet"]["content"]
    assert "Composição" not in result["fullChordSheet"]["content"]
    assert "75 bpm" not in str(result["fullChordSheet"]["sections"])
    assert "Letra original" in result["fullChordSheet"]["content"]
    assert repair_song(result)==result
    assert source==song()


def test_explicit_artist_conflicts_and_nested_copies():
    source=song();source["fullChordSheet"]["content"]="Artista: Aline Barros\n"+source["fullChordSheet"]["content"]
    assert repair_song(source)["artist"]=="Aline Barros"
    source["artist"]="Minha versão";source["bpm"]=100
    assert repair_song(source)["artist"]=="Minha versão"
    assert repair_song(source)["bpm"]==100
    source["fullChordSheet"]["content"]+="\nBPM: 80"
    assert "75 bpm" in repair_song(source)["fullChordSheet"]["content"]
    assert repair_tree({"items":[{"song":song(),"playback":{"bpm":110}}]})["items"][0]["playback"]["bpm"]==110


def test_migration_is_once_and_does_not_notify(app):
    from app.database import db
    from app.models import PersonalSong, EventChange
    from app.models.playlist_collaboration import PlaylistNotification
    from app.services.song_metadata_migration import SongMetadataMigration, repair_saved_metadata
    from test_event_permissions import register
    client=app.test_client();register(client,"metadata-user","Pessoa")
    with app.app_context():
        SongMetadataMigration.query.delete()
        db.session.add(PersonalSong(id="metadata-song",client_id="local",owner_user_id="metadata-user",song_data=song(),version=1))
        db.session.commit()
        assert repair_saved_metadata()==1
        row=db.session.get(PersonalSong,"metadata-song")
        assert row.song_data["bpm"]==75 and row.version==2
        assert row.song_data["playbackSettings"]["bpm"]==75
        assert repair_saved_metadata()==0
        assert EventChange.query.count()==PlaylistNotification.query.count()==0


def test_bpm_requires_evidence_not_a_model_field(client):
    from unittest.mock import patch
    from test_api import sample_result, auth_headers
    generated=sample_result()
    generated.bpm=140  # Simula uma sugestão numérica não documentada.
    with patch("app.services.providers.deepseek_provider.DeepSeekProvider.generate", return_value=generated):
        response=client.post("/api/resumo-harmonico",json={"tipo":"texto","titulo":"Canção teste","conteudo":"Db B4 Gb/Bb"},headers=auth_headers(client))
    assert response.status_code==200
    assert response.get_json().get("bpm") is None
    assert response.get_json().get("bpmSource") is None


def test_bpm_original_source_wins_over_model(client):
    from unittest.mock import patch
    from test_api import sample_result, auth_headers
    generated=sample_result();generated.bpm=140
    with patch("app.services.providers.deepseek_provider.DeepSeekProvider.generate", return_value=generated):
        response=client.post("/api/resumo-harmonico",json={"tipo":"texto","titulo":"Canção teste","conteudo":"BPM: 75\nDb B4 Gb/Bb"},headers=auth_headers(client))
    assert response.status_code==200
    data=response.get_json()
    assert data["bpm"]==75 and data["bpmSource"]["evidence"]=="BPM: 75"


def test_unverified_generated_text_and_legacy_72_are_not_relabelled():
    original=song();original["bpm"]=72
    assert repair_song(original)["bpm"]==72
    assert repair_song(original).get("bpmSource") is None
    original["fullChordSheet"]["source"]="model_knowledge"
    original.pop("bpm")
    assert repair_song(original).get("bpm") is None
    original["fullChordSheet"]["source"]="web_source"
    original["fullChordSheet"]["bpmEvidenceText"]=""
    assert repair_song(original).get("bpm") is None
    original["fullChordSheet"].pop("bpmEvidenceText")
    original["fullChordSheet"]["sourceContent"]="C G\nLetra sem andamento informado"
    assert repair_song(original).get("bpm") is None, "BPM inserido na transcrição não está na fonte original"


def test_rollout_replaces_prior_preferences_once_from_explicit_source():
    from app.services.song_metadata import reset_bpm_to_source
    old=song();old["bpm"]=72
    old["playbackSettings"].update(instrument="guitar",scrollSpeed=40)
    updated=reset_bpm_to_source(old)
    assert updated["bpm"]==updated["playbackSettings"]["bpm"]==75
    assert updated["playbackSettings"]["instrument"]=="guitar"
    assert updated["playbackSettings"]["scrollSpeed"]==40
    updated["playbackSettings"]["bpm"]=95
    assert reset_bpm_to_source(updated)["playbackSettings"]["bpm"]==95
    playlist=reset_bpm_to_source({"items":[{"song":old,"playback":{"bpm":110,"capo":2}}]})
    assert playlist["items"][0]["playback"]=={"bpm":75,"capo":2}
    playlist["items"][0]["playback"]["bpm"]=100
    assert reset_bpm_to_source(playlist)["items"][0]["playback"]["bpm"]==100
    unknown=song();unknown["fullChordSheet"]["content"]="C G\nLetra";unknown["fullChordSheet"]["sections"]=[]
    assert reset_bpm_to_source(unknown)["playbackSettings"]["bpm"]==90
