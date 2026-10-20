"""Regressões da memória de tons: participação Vocal não é preferência da playlist."""
from datetime import datetime, timezone

import pytest

from app.database import db
from app.models import (
    Event, EventMember, EventRepertoireItem, PersonalRepertoireOverride,
    PersonalSong, SharedSong,
)
from test_event_invitations import FakeSupabase
from test_event_permissions import auth


BASE = "/api/collaboration"
LEADER = "vocal-leader"
SINGER = "vocal-singer"
OTHER = "vocal-other"


def prepare(client, app):
    app.extensions["supabase_auth"] = FakeSupabase()
    for user_id in (LEADER, SINGER, OTHER):
        assert client.get(BASE + "/me", headers=auth("signed-" + user_id)).status_code == 200


def history(app, identifier, key="G", *, vocalist=SINGER, role="Vocal", date="2000-01-01",
            title="A Alegria", artist="Equipe", song_id=None):
    with app.app_context():
        event = Event(id=identifier, title="Evento anterior", event_date=date, event_time="19:00",
                      leader_id=LEADER, creator_id=LEADER)
        db.session.add(event)
        db.session.flush()
        db.session.add(EventMember(event_id=identifier, user_id=vocalist, name=vocalist, role=role))
        db.session.add(EventRepertoireItem(id=identifier + "-item", event_id=identifier,
                                          song_id=song_id or identifier + "-song", position=0,
                                          shared_title=title, shared_artist=artist, shared_key=key,
                                          shared_capo="2", shared_chord_sheet="C F G"))
        db.session.commit()


def item(identifier, key="C", title="A Alegria", artist="Equipe", song_id=None):
    return {"id": identifier, "songId": song_id or identifier + "-song", "shared": {
        "title": title, "artist": artist, "key": key, "capo": "2", "chordSheet": "C F G", "notes": "arranjo"}}


def payload(identifier="vocal-next", *, members=None, repertoire=None):
    return {"id": identifier, "title": "Próximo evento", "date": "2099-01-01", "time": "19:00",
            "leaderId": LEADER, "members": [{"id": LEADER, "name": LEADER, "role": "Liderança"}] + (
                [{"id": SINGER, "name": SINGER, "role": "Vocal"}] if members is None else members),
            "repertoire": [item(identifier + "-item")] if repertoire is None else repertoire}


def create(client, value):
    response = client.post(BASE + "/events", headers=auth("signed-" + LEADER), json=value)
    assert response.status_code == 201, response.json
    return response.json


def update(client, value):
    response = client.put(BASE + "/events/" + value["id"], headers=auth("signed-" + LEADER), json=value)
    assert response.status_code == 200, response.json
    return response.json


def test_latest_past_performance_wins_not_future_or_recent_edit(client, app):
    prepare(client, app)
    history(app, "vocal-old", "G", date="2000-01-01")
    history(app, "vocal-recent", "A", date="2001-01-01")
    history(app, "vocal-future", "F", date="2098-01-01")
    with app.app_context():
        db.session.get(Event, "vocal-old").updated_at = datetime.now(timezone.utc)
        db.session.commit()
    event = create(client, payload(repertoire=[item("new-identity", title="  A ALEGRIA  ", artist="equipe")]))
    assert event["repertoire"][0]["shared"]["key"] == "A"
    assert event["repertoire"][0]["shared"]["capo"] == "2"
    assert event["repertoire"][0]["shared"]["chordSheet"] == "C F G"


@pytest.mark.parametrize("current_role,history_role,expected", [
    ("Vocal", "Vocal", "G"), ("vocalista", "Vocal", "G"),
    ("Vocal", "vocalista", "G"), ("Backing Vocal", "Vocal", "C"),
    ("Guitarra", "Vocal", "C"), ("Vocal", "Backing Vocal", "C"),
    ("Vocal", "Guitarra", "C"),
])
def test_only_vocalist_role_has_memory(client, app, current_role, history_role, expected):
    prepare(client, app)
    history(app, "vocal-history", role=history_role)
    event = create(client, payload(members=[{"id": SINGER, "name": SINGER, "role": current_role}]))
    assert event["repertoire"][0]["shared"]["key"] == expected


@pytest.mark.parametrize("second_key,expected", [("A", "C"), ("G", "G")])
def test_multiple_vocalists_conflict_or_agreement(client, app, second_key, expected):
    prepare(client, app)
    history(app, "vocal-one", "G")
    history(app, "vocal-two", second_key, vocalist=OTHER)
    event = create(client, payload(members=[{"id": uid, "name": uid, "role": "Vocal"} for uid in (SINGER, OTHER)]))
    assert event["repertoire"][0]["shared"]["key"] == expected


def test_without_history_leaves_current_key_unchanged(client, app):
    prepare(client, app)
    event = create(client, payload(repertoire=[item("without-history", key="Am")]))
    assert event["repertoire"][0]["shared"]["key"] == "Am"


def test_enharmonic_keys_are_agreement_not_conflict(client, app):
    prepare(client, app)
    history(app, "vocal-flat", "Db")
    history(app, "vocal-sharp", "C#", vocalist=OTHER)
    event = create(client, payload(members=[{"id": uid, "name": uid, "role": "Vocal"} for uid in (SINGER, OTHER)]))
    assert event["repertoire"][0]["shared"]["key"] in {"Db", "C#"}


def test_song_identity_requires_artist_and_does_not_trust_cross_user_local_id(client, app):
    prepare(client, app)
    history(app, "vocal-identity", song_id="same-local-id")
    event = create(client, payload(repertoire=[
        item("same-title-wrong-artist", artist="Outro artista", song_id="same-local-id"),
        item("unknown-artist", artist=""),
        item("different-title", title="Outra canção"),
        item("same-music-new-local-id"),
    ]))
    assert [row["shared"]["key"] for row in event["repertoire"]] == ["C", "C", "C", "G"]


def test_adding_vocalist_and_later_new_song_both_apply_history(client, app):
    prepare(client, app)
    history(app, "vocal-song-one", "G")
    history(app, "vocal-song-two", "A", title="É Ele")
    event = create(client, payload(members=[]))
    assert event["repertoire"][0]["shared"]["key"] == "C"
    event["members"].append({"id": SINGER, "name": SINGER, "role": "Vocal"})
    event = update(client, event)
    assert event["repertoire"][0]["shared"]["key"] == "G"
    event["repertoire"].append(item("added-after-vocalist", title="É Ele"))
    event = update(client, event)
    assert [row["shared"]["key"] for row in event["repertoire"]] == ["G", "A"]


@pytest.mark.parametrize("channel", ["direct", "link"])
def test_accepting_vocal_invitation_applies_key_only_after_accept(client, app, channel):
    prepare(client, app)
    history(app, "vocal-before-invite", "G")
    event = create(client, payload(members=[]))
    if channel == "direct":
        invitation = client.post(BASE + "/events/" + event["id"] + "/direct-invitations",
                                 headers=auth("signed-" + LEADER), json={"userId": SINGER, "role": "Vocal"})
        assert invitation.status_code == 201, invitation.json
        path = BASE + "/direct-invitations/" + invitation.json["id"] + "/respond"
        request_body = {"action": "accept"}
    else:
        invitation = client.post(BASE + "/events/" + event["id"] + "/invitations",
                                 headers=auth("signed-" + LEADER), json={"name": "Vinicius", "role": "Vocal"})
        assert invitation.status_code == 201, invitation.json
        path = BASE + "/invitations/" + invitation.json["token"] + "/accept"
        request_body = {}
    assert client.get(BASE + "/events/" + event["id"], headers=auth("signed-" + LEADER)).json["repertoire"][0]["shared"]["key"] == "C"
    response = client.post(path, headers=auth("signed-" + SINGER), json=request_body)
    assert response.status_code == 200, response.json
    accepted = response.json["event"] if channel == "direct" else response.json
    assert accepted["repertoire"][0]["shared"]["key"] == "G"
    assert accepted["permissions"]["canEditShared"] is False
    assert accepted["remoteVersion"] > event["remoteVersion"]
    repeated = client.post(path, headers=auth("signed-" + SINGER), json=request_body)
    assert repeated.status_code == 200


def test_manual_key_survives_unrelated_update_and_another_vocalist(client, app):
    prepare(client, app)
    history(app, "vocal-manual-one", "G")
    history(app, "vocal-manual-two", "G", vocalist=OTHER)
    event = create(client, payload())
    row = event["repertoire"][0]
    edited = {**row["shared"], "key": "B", "remoteVersion": event["remoteVersion"]}
    response = client.patch(BASE + "/events/" + event["id"] + "/repertoire/" + row["id"] + "/shared",
                            headers=auth("signed-" + LEADER), json=edited)
    assert response.status_code == 200, response.json
    event = response.json
    event["title"] = "Outro nome de evento"
    event["members"].append({"id": OTHER, "name": OTHER, "role": "Vocal"})
    event = update(client, event)
    assert event["repertoire"][0]["shared"]["key"] == "B"


def test_personal_history_and_libraries_are_not_used_or_modified(client, app):
    prepare(client, app)
    history(app, "vocal-private", "G")
    with app.app_context():
        db.session.add(PersonalRepertoireOverride(event_id="vocal-private", repertoire_item_id="vocal-private-item",
                                                  user_id=SINGER, personal_key="F#"))
        db.session.add(PersonalSong(id="private-song-row", owner_user_id=LEADER, client_id="vocal-next-item-song",
                                    song_data={"key": "C", "title": "A Alegria"}))
        db.session.add(SharedSong(id="catalog-song-row", title="A Alegria", artist="Equipe",
                                 normalized_title="a alegria", normalized_artist="equipe",
                                 song_key="C", song_data={"key": "C"}))
        db.session.commit()
    event = create(client, payload())
    assert event["repertoire"][0]["shared"]["key"] == "G"
    with app.app_context():
        assert db.session.get(PersonalSong, "private-song-row").song_data["key"] == "C"
        assert db.session.get(SharedSong, "catalog-song-row").song_key == "C"
        assert db.session.get(SharedSong, "catalog-song-row").song_data["key"] == "C"
        assert PersonalRepertoireOverride.query.filter_by(event_id="vocal-private").one().personal_key == "F#"


def test_memory_survives_deletion_of_source_event(client, app):
    prepare(client, app)
    history(app, "vocal-to-delete", "A")
    with app.app_context():
        db.session.add(EventMember(event_id="vocal-to-delete", user_id=LEADER, name=LEADER, role="Liderança"))
        db.session.commit()
    assert client.delete(BASE + "/events/vocal-to-delete", headers=auth("signed-" + LEADER)).status_code == 204
    event = create(client, payload())
    assert event["repertoire"][0]["shared"]["key"] == "A"
    assert event["repertoire"][0]["shared"]["chordSheetKey"] == "C"


def test_today_invalid_dates_and_empty_source_key_are_not_guessed(client, app):
    from zoneinfo import ZoneInfo
    prepare(client, app)
    history(app, "vocal-today", "G", date=datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat())
    history(app, "vocal-invalid-date", "A", date="2000-99-99")
    assert create(client, payload())["repertoire"][0]["shared"]["key"] == "C"
    history(app, "vocal-valid-date", "G")
    assert create(client, payload("unknown-key", repertoire=[item("unknown-key-item", key="")]))["repertoire"][0]["shared"]["key"] == ""


@pytest.mark.parametrize("removed", ["member", "song"])
def test_history_is_remembered_before_removing_past_participation(client, app, removed):
    prepare(client, app)
    history(app, "vocal-edit-old", "G")
    with app.app_context():
        db.session.add(EventMember(event_id="vocal-edit-old", user_id=LEADER, name=LEADER, role="Liderança"))
        db.session.commit()
    old = client.get(BASE + "/events/vocal-edit-old", headers=auth("signed-" + LEADER)).json
    if removed == "member":
        old["members"] = [member for member in old["members"] if member["id"] == LEADER]
    else:
        old["repertoire"] = []
    update(client, old)
    assert create(client, payload())["repertoire"][0]["shared"]["key"] == "G"


def test_history_is_remembered_before_renaming_past_song(client, app):
    prepare(client, app)
    history(app, "vocal-rename-old", "G")
    with app.app_context():
        db.session.add(EventMember(event_id="vocal-rename-old", user_id=LEADER, name=LEADER, role="Liderança"))
        db.session.commit()
    old = client.get(BASE + "/events/vocal-rename-old", headers=auth("signed-" + LEADER)).json
    row = old["repertoire"][0]
    response = client.patch(BASE + "/events/vocal-rename-old/repertoire/" + row["id"] + "/shared",
                            headers=auth("signed-" + LEADER), json={**row["shared"], "title": "Outra composição"})
    assert response.status_code == 200, response.json
    assert create(client, payload())["repertoire"][0]["shared"]["key"] == "G"


def test_major_minor_change_is_not_guessed_as_transposition(client, app):
    prepare(client, app)
    history(app, "vocal-minor-history", "Am")
    assert create(client, payload())["repertoire"][0]["shared"]["key"] == "C"
