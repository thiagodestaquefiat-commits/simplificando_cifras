from app.database import db
from app.models import SharedSong, SharedSongReport, PersonalSong
from test_event_permissions import auth, register
from test_shared_songs import ai_song


def setup_song(client, app):
    token = register(client, "report-user", "Usuário")
    client.put("/api/library/songs/mine", headers=auth(token), json={"songData": ai_song()})
    with app.app_context():
        return token, SharedSong.query.one().id


def test_reports_persist_deduplicate_and_never_change_songs(client, app):
    token, song_id = setup_song(client, app)
    assert client.post(f"/api/shared-songs/{song_id}/reports", json={"reason": "chords"}).status_code == 401
    target = client.get("/api/shared-songs/report-target?title=Asa%20Branca&artist=Luiz%20Gonzaga", headers=auth(token)).get_json()
    assert target["song"]["id"] == song_id
    assert client.get("/api/shared-songs/report-target?title=Asa&artist=Luiz", headers=auth(token)).get_json()["song"] is None
    response = client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":"chords", "details":"Acorde errado no refrão"})
    assert response.status_code == 201 and response.get_json()["report"]["status"] == "pending"
    duplicate = client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":"lyrics"})
    assert duplicate.status_code == 200 and duplicate.get_json()["duplicate"]
    with app.app_context():
        assert SharedSongReport.query.count() == 1
        assert SharedSong.query.count() == 1 and PersonalSong.query.count() == 1
        assert PersonalSong.query.one().song_data["title"] == "Asa Branca"


def test_invalid_reports_rejected(client, app):
    token, song_id = setup_song(client, app)
    assert client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":"delete"}).status_code == 400
    assert client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":{}, "details":""}).status_code == 400
    assert client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":"lyrics", "details":"a"*2001}).status_code == 400
    assert client.post("/api/shared-songs/missing/reports", headers=auth(token), json={"reason":"lyrics"}).status_code == 404


def test_review_is_private_and_legacy_id_cannot_impersonate_reviewer(client, app):
    token, song_id = setup_song(client, app)
    report = client.post(f"/api/shared-songs/{song_id}/reports", headers=auth(token), json={"reason":"lyrics"}).get_json()["report"]
    app.config["SHARED_SONG_REVIEWER_IDS"] = ["report-user", "reviewer"]
    assert client.get("/api/shared-songs/review-capability", headers=auth(token)).get_json() == {"canReview":False}
    assert client.get("/api/shared-songs/reports", headers=auth(token)).status_code == 403
    assert client.patch(f'/api/shared-songs/reports/{report["id"]}', headers=auth(token), json={"status":"resolved"}).status_code == 403
    class Provider:
        def validate(self, token):
            return {"id":"reviewer", "email":"reviewer@example.test", "user_metadata":{"role":"admin"}}
    app.extensions["supabase_auth"] = Provider()
    reviewer = auth("verified-test-token")
    assert client.get("/api/shared-songs/review-capability", headers=reviewer).get_json()["canReview"]
    queue = client.get("/api/shared-songs/reports", headers=reviewer).get_json()
    assert len(queue["reports"]) == 1 and "reporter_id" not in queue["reports"][0]
    assert "songData" in queue["reports"][0]
    assert client.patch(f'/api/shared-songs/reports/{report["id"]}', headers=reviewer, json={"status":"deleted"}).status_code == 400
    assert client.patch(f'/api/shared-songs/reports/{report["id"]}', headers=reviewer, json={"status":"in_review", "reviewNote":"Conferir refrão"}).status_code == 200
    assert client.get("/api/shared-songs/reports?status=pending", headers=reviewer).get_json()["reports"] == []
    assert client.get("/api/shared-songs/reports?status=in_review", headers=reviewer).get_json()["reports"][0]["reviewNote"] == "Conferir refrão"
    assert client.get("/api/shared-songs/reports?offset=abc", headers=reviewer).status_code == 400
    app.config["SHARED_SONG_REVIEWER_IDS"] = []
    assert client.get("/api/shared-songs/reports", headers=reviewer).status_code == 403
    with app.app_context():
        assert SharedSong.query.count() == 1 and PersonalSong.query.count() == 1


def test_exact_lookup_without_artist(client, app):
    token = register(client, "no-artist", "Usuário")
    client.put("/api/library/songs/x", headers=auth(token), json={"songData":ai_song(artist="")})
    assert client.get("/api/shared-songs/report-target?title=Asa%20Branca", headers=auth(token)).get_json()["song"] is not None
