"""Classificação do catálogo, BPM da comunidade, músicas parecidas e recuperação da força-tarefa."""
import json
from types import SimpleNamespace

from app.database import db
from app.models import PersonalSong, SharedSong, SongProfile
from app.services.shared_songs_service import backfill_completions
from app.services.song_classifier import classify_ids, normalize_classification
from test_event_permissions import auth, register
from test_shared_songs import ai_song

PDF = {"source": "user_upload", "content": "G   C\nOlha pro céu", "sections": []}


class FakeAI:
    """Responde a classificação pelo título; registra quantas vezes foi chamado."""

    def __init__(self, answers):
        self.answers, self.calls = answers, []
        self.responses = SimpleNamespace(create=self.create)

    def create(self, **kwargs):
        prompt = kwargs["input"][1]["content"]
        self.calls.append(prompt)
        title = prompt.split("\n")[0].replace("Título: ", "")
        return SimpleNamespace(output_text=json.dumps(self.answers[title]))


WORSHIP = {"genero": "Louvor e Adoração", "subgenero": "Adoração congregacional", "andamento": "lenta", "bpm": 70, "temas": ["entrega", "graça"], "sacra": True}
WORSHIP2 = {**WORSHIP, "bpm": 74, "temas": ["entrega", "presença"]}
CELEBRATION = {"genero": "Louvor e Adoração", "subgenero": "Celebração", "andamento": "rapida", "bpm": 128, "temas": ["vitória"], "sacra": True}
ROCK = {"genero": "Rock", "subgenero": "Rock nacional", "andamento": "media", "bpm": 72, "temas": ["entrega"], "sacra": False}


def save(client, token, client_id, song):
    assert client.put(f"/api/library/songs/{client_id}", headers=auth(token), json={"songData": song}).status_code < 300


def classify_all(app, answers):
    fake = FakeAI(answers)
    with app.app_context():
        app.extensions["catalog_classifier_client"] = fake
        app.config["CATALOG_CLASSIFY_PER_REQUEST"] = 50
        classify_ids([song.id for song in SharedSong.query.all()])
        app.extensions.pop("catalog_classifier_client")
    return fake


def test_normalize_keeps_only_agreed_vocabulary():
    assert normalize_classification({"genero": "rock", "bpm": "128.4", "andamento": "Rápida", "temas": ["A", "a", "b"]}) == {
        "genero": "Rock", "subgenero": None, "andamento": "rapida", "bpmEstimado": 128, "temas": ["a", "b"], "sacra": False}
    assert normalize_classification({"genero": "axé"}) is None
    assert normalize_classification({"genero": "Gospel", "bpm": 999})["bpmEstimado"] is None


def test_new_catalog_song_is_classified_once_and_never_touches_song_data(client, app):
    token = register(client, "rec-a", "A")
    fake = FakeAI({"Asa Branca": WORSHIP})
    app.config.update(CATALOG_CLASSIFY_ENABLED=True, CATALOG_CLASSIFY_ASYNC=False)
    app.extensions["catalog_classifier_client"] = fake
    try:
        save(client, token, "a", ai_song())
        save(client, token, "a", {**ai_song(), "fullChordSheet": PDF})  # completada: já classificada, não paga de novo
    finally:
        app.extensions.pop("catalog_classifier_client")
        app.config.update(CATALOG_CLASSIFY_ENABLED=False)
    assert len(fake.calls) == 1 and "Título: Asa Branca" in fake.calls[0]
    with app.app_context():
        song = SharedSong.query.one()
        assert "classificacao" not in song.song_data and "bpmVotos" not in song.song_data
        assert SongProfile.query.one().classification["subgenero"] == "Adoração congregacional"
    found = client.get("/api/shared-songs/versions/" + song.id, headers=auth(token))
    assert found.status_code == 200, "a versão do catálogo continua válida para o app"


def test_bpm_votes_are_anonymous_and_community_beats_ai(client, app):
    users = [register(client, f"rec-b{index}", f"B{index}") for index in range(3)]
    save(client, users[0], "s", ai_song(bpm=90))
    classify_all(app, {"Asa Branca": WORSHIP})  # IA chutou 70
    profile = lambda: client.post("/api/shared-songs/profiles", headers=auth(users[0]),
                                  json={"items": [{"title": "Asa Branca", "artist": "Luiz Gonzaga", "key": "G"}]}).get_json()["profiles"][0]
    assert profile()["bpm"] == 70 and profile()["bpmVotos"] == 1, "com 1 voto ainda vale a IA"
    save(client, users[1], "s", ai_song(bpm=96))
    save(client, users[2], "s", ai_song(bpm=94))
    assert profile()["bpm"] == 94 and profile()["bpmVotos"] == 3
    save(client, users[2], "s", ai_song(bpm=100))  # mudou de ideia: troca o voto, não soma
    assert profile()["bpmVotos"] == 3
    with app.app_context():
        votes = SongProfile.query.one().bpm_votes
        assert all(user not in json.dumps(votes) for user in ("rec-b0", "rec-b1", "rec-b2"))


def test_profiles_returns_null_for_unknown_or_private_songs(client, app):
    token = register(client, "rec-c", "C")
    save(client, token, "t", ai_song(title="Digitada", sourceInfo={"type": "text"}, bpm=80))
    body = client.post("/api/shared-songs/profiles", headers=auth(token),
                       json={"items": [{"title": "Digitada"}, {"title": "Nem existe"}, "lixo"]}).get_json()
    assert body["profiles"] == [None, None, None]
    assert client.post("/api/shared-songs/profiles", headers=auth(token), json={"items": [{}] * 301}).status_code == 400


def test_similar_respects_subgenre_bpm_and_sacred_vs_secular(client, app):
    token = register(client, "rec-d", "D")
    for index, title in enumerate(["Asa Branca", "Me Rendo", "Celebrai", "Balada Rock"]):
        save(client, token, f"s{index}", ai_song(id=f"s{index}", title=title))
    classify_all(app, {"Asa Branca": WORSHIP, "Me Rendo": WORSHIP2, "Celebrai": CELEBRATION, "Balada Rock": ROCK})
    body = client.get("/api/shared-songs/similar?title=Asa%20Branca&artist=Luiz%20Gonzaga&key=G", headers=auth(token)).get_json()
    titles = [item["title"] for item in body["similar"]]
    assert titles[0] == "Me Rendo"
    assert "Balada Rock" not in titles, "música secular nunca é sugerida para música sacra"
    assert body["song"]["genero"] == "Louvor e Adoração"
    empty = client.get("/api/shared-songs/similar?title=Nao%20Existe", headers=auth(token)).get_json()
    assert empty == {"song": None, "similar": []}


def test_merging_duplicates_keeps_profile_and_votes(client, app):
    from app.services.shared_songs_service import SharedSongService, dedupe_titles, normalize_text
    token, other = register(client, "rec-e", "E"), register(client, "rec-e2", "E2")
    save(client, token, "a", ai_song(bpm=90))
    with app.app_context():
        summary = SharedSongService._summary_from_song(ai_song())
        extra = SharedSongService._new_entry(summary, normalize_text("Asa Branca"), normalize_text("Luiz Gonzaga"), "x")
        db.session.add(SongProfile(song_id=extra.id, classification={**normalize_classification(WORSHIP), "origem": "ia"}, bpm_votes={"outro": 100}))
        db.session.commit()
        dedupe_titles({"asa branca"})
        assert SharedSong.query.count() == 1
        row = SongProfile.query.one()
        assert row.song_id == SharedSong.query.one().id
        assert row.classification["genero"] == "Louvor e Adoração" and len(row.bpm_votes) == 2


def test_backfill_recovers_task_force_completions(client, app):
    team, reader = register(client, "rec-f", "F"), register(client, "rec-f2", "F2")
    save(client, team, "a", ai_song())
    save(client, team, "b", ai_song(id="b", title="Outra"))
    save(client, team, "t", ai_song(id="t", title="Particular", sourceInfo={"type": "text"}))
    with app.app_context():
        # Simula o que aconteceu antes desta correção: a biblioteca foi completada, o catálogo não.
        for personal in PersonalSong.query.all():
            data = dict(personal.song_data)
            if data["title"] == "Asa Branca":
                data["fullChordSheet"] = PDF
            if data["title"] == "Outra":
                data.update(originalKey="A", fullChordSheet=PDF)  # tom trocado: é outra versão, não completa
            personal.song_data = data
        db.session.commit()
        report = backfill_completions()
        db.session.commit()
        assert [(item["title"], item["source"]) for item in report] == [("Asa Branca", "user_upload")]
        assert SharedSong.query.count() == 2
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Luiz%20Gonzaga", headers=auth(reader)).get_json()["match"]
    assert found["songData"]["fullChordSheet"]["content"] == PDF["content"]
    with app.app_context():
        assert backfill_completions() == [], "rodar de novo não muda nada"
