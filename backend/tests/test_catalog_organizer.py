"""TEMPORÁRIO: organizar o catálogo compartilhado no padrão ROUDY (simulação + aplicação, só revisores)."""
import uuid

from app.database import db
from app.models import SharedSong
from test_event_permissions import auth, register

SHEET = """[Primeira Parte]

Fm         Db9
Primeira linha do verso aqui
Fm/C          Db9
Segunda linha do verso

[Refrão]

Bbm      Db9       Fm   Cm
Linha do refrão número um
Bbm      Db9       Fm   Eb
Linha do refrão número dois
"""


def summary(blocos, sheet=None, title="Música"):
    return {"schemaVersion": 2, "titulo": title, "artista": "Artista", "tom": "Fm", "capotraste": 2, "confianca": "media",
            "observacoes": [], "harmonicSummary": {"blocos": blocos},
            "fullChordSheet": {"visibility": "private", "source": "web_source", "content": sheet, "sections": []} if sheet else None}


def add(app, title, data):
    with app.app_context():
        song = SharedSong(id=str(uuid.uuid4()), title=title, artist="Artista", normalized_title=title.lower(), normalized_artist="artista",
                          song_key="Fm", capo="2", song_data=data)
        db.session.add(song)
        db.session.commit()
        return song.id


def reviewer(client, app):
    register(client, "qualquer", "Qualquer")
    class Provider:
        def validate(self, token):
            return {"id": "thiago-sub", "email": "t@example.test", "user_metadata": {}}
    app.extensions["supabase_auth"] = Provider()
    app.config["SHARED_SONG_REVIEWER_IDS"] = ["thiago-sub"]
    return auth("verified-test-token")


def seed(app):
    return {
        "messy": add(app, "Bagunçada", summary([{"acordes": ["Fm", "Db9", "Fm/C", "Db9"]}, {"acordes": ["Bbm", "Db9", "Fm", "Cm", "Bbm", "Db9", "Fm", "Eb"]}], SHEET, "Bagunçada")),
        "ok": add(app, "Bonita", summary([{"acordes": ["C#m", "A", "E", "B"], "repeticoes": 4, "fraseGuia": "Ouço um barulho diferente"}], SHEET, "Bonita")),
        "nosheet": add(app, "Sem Letra", summary([{"acordes": ["G", "D", "Em", "C"]}], None, "Sem Letra")),
    }


def test_preview_does_not_write_and_reports_each_case(client, app):
    ids = seed(app)
    headers = reviewer(client, app)
    body = client.get("/api/shared-songs/admin/organizar", headers=headers).get_json()
    by_id = {item["id"]: item for item in body["items"]}
    assert body["total"] == 3 and body["hasMore"] is False
    assert by_id[ids["messy"]]["status"] == "organizar"
    assert "Primeira linha do verso aqui" in [b["fraseGuia"] for b in by_id[ids["messy"]]["depois"]]
    assert by_id[ids["ok"]]["status"] == "ja_no_padrao"
    assert by_id[ids["nosheet"]]["status"] == "sem_letra_cifra"
    with app.app_context():
        assert db.session.get(SharedSong, ids["messy"]).song_data["harmonicSummary"]["blocos"][0].get("fraseGuia") is None


def test_apply_changes_only_summary_of_messy_songs(client, app):
    ids = seed(app)
    headers = reviewer(client, app)
    with app.app_context():
        before_ok = db.session.get(SharedSong, ids["ok"]).song_data
    response = client.post("/api/shared-songs/admin/organizar", headers=headers, json={"ids": list(ids.values())})
    applied = response.get_json()["aplicadas"]
    assert response.status_code == 200 and [item["id"] for item in applied] == [ids["messy"]]
    assert applied[0]["antes"][0]["fraseGuia"] is None
    with app.app_context():
        messy = db.session.get(SharedSong, ids["messy"]).song_data
        assert any(b.get("fraseGuia") == "Primeira linha do verso aqui" for b in messy["harmonicSummary"]["blocos"])
        assert messy["fullChordSheet"]["content"] == SHEET and messy["tom"] == "Fm" and messy["capotraste"] == 2
        assert db.session.get(SharedSong, ids["ok"]).song_data == before_ok
    # Rodar de novo não muda mais nada.
    again = client.post("/api/shared-songs/admin/organizar", headers=headers, json={"ids": [ids["messy"]]}).get_json()["aplicadas"]
    assert again == []


def test_only_reviewers_can_use_it(client, app):
    seed(app)
    token = register(client, "comum", "Comum")
    app.config["SHARED_SONG_REVIEWER_IDS"] = ["comum"]  # ID local nunca vira revisor
    denied = client.get("/api/shared-songs/admin/organizar", headers=auth(token))
    assert denied.status_code == 403 and "SHARED_SONG_REVIEWER_IDS" in denied.get_json()["erro"]["mensagem"]
    assert client.post("/api/shared-songs/admin/organizar", headers=auth(token), json={"ids": ["x"]}).status_code == 403
    assert client.get("/api/shared-songs/admin/organizar").status_code == 401


def test_apply_validates_batch(client, app):
    headers = reviewer(client, app)
    assert client.post("/api/shared-songs/admin/organizar", headers=headers, json={"ids": []}).status_code == 400
    assert client.post("/api/shared-songs/admin/organizar", headers=headers, json={"ids": [str(i) for i in range(101)]}).status_code == 400
