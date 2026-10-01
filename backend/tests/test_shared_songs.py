from types import SimpleNamespace

from app.models import SharedSong
from app.schemas.resumo_harmonico import ResumoHarmonicoRequest, ResumoHarmonicoResponse
from app.services.ia_service import IaService
from app.services.shared_songs_service import SharedSongMatch, normalize_text
from test_event_permissions import auth, register


def ai_song(**overrides):
    value = {
        "id": "ai-1", "title": "Asa Branca", "artist": "Luiz Gonzaga", "originalKey": "G", "capo": 0,
        "source": "ai", "aiGenerated": True, "sourceInfo": {"type": "online", "name": None, "url": None},
        "sections": [{"label": "Verso", "hideLabel": False, "lines": [{"lyrics": "", "repeticoes": 2, "chords": [{"chord": "G", "position": 0}, {"chord": "C", "position": 3}]}]}],
    }
    value.update(overrides)
    return value


def test_normalize_text_strips_accents_and_punctuation():
    assert normalize_text("  Coração, Valente!! ") == "coracao valente"


def test_ai_song_is_contributed_once_and_searchable(client, app):
    token = register(client, "shared-a", "A")
    for client_id in ("one", "two"):
        client.put(f"/api/library/songs/{client_id}", headers=auth(token), json={"songData": ai_song()})
    with app.app_context():
        stored = SharedSong.query.one()
        assert stored.contributed_by == "shared-a" and stored.song_data["fullChordSheet"] is None
        assert stored.song_data["harmonicSummary"]["blocos"][0]["acordes"] == ["G", "C"]
    searcher = register(client, "shared-a2", "A2")
    found = client.get("/api/shared-songs/search?title=asa%20branca&artist=Luiz%20Gonzaga", headers=auth(searcher)).get_json()
    assert found["match"]["title"] == "Asa Branca" and found["match"]["score"] == 1.0
    assert found["match"]["timesSearched"] == 1
    assert client.get("/api/shared-songs/search?title=", headers=auth(token)).status_code == 400


def test_only_search_and_file_songs_go_to_catalog(client, app):
    """Busca por IA (online) e arquivo/foto (upload) entram no catálogo; Texto e músicas feitas à mão são pessoais."""
    token = register(client, "shared-b", "B")
    client.put("/api/library/songs/up", headers=auth(token), json={"songData": ai_song(sourceInfo={"type": "upload"})})
    client.put("/api/library/songs/web", headers=auth(token), json={"songData": ai_song(title="Da Busca")})
    client.put("/api/library/songs/txt", headers=auth(token), json={"songData": ai_song(title="Digitada", sourceInfo={"type": "text"})})
    client.put("/api/library/songs/manual", headers=auth(token), json={"songData": ai_song(aiGenerated=False, title="Feita a Mao", sourceInfo={"type": "manual"})})
    with app.app_context():
        assert sorted(song.title for song in SharedSong.query.all()) == ["Asa Branca", "Da Busca"]


def test_typed_lyrics_stay_personal_even_on_shared_song(client, app):
    """Letra digitada pelo usuário (user_text) não vai para o catálogo; o resumo da fonte real vai."""
    token = register(client, "shared-c", "C")
    typed = {"source": "user_text", "content": "G  C\nMinha versão", "sections": []}
    client.put("/api/library/songs/one", headers=auth(token), json={"songData": ai_song(fullChordSheet=typed)})
    with app.app_context():
        stored = SharedSong.query.one()
        assert stored.song_data["fullChordSheet"] is None
        assert stored.song_data["harmonicSummary"]["blocos"][0]["acordes"] == ["G", "C"]


class ExplodingProvider:
    def generate(self, *args, **kwargs):
        raise AssertionError("IA não deveria ser chamada")


def test_ia_service_returns_catalog_match_without_calling_provider():
    data = {"titulo": "Asa Branca", "artista": "Luiz Gonzaga", "tom": "G", "harmonicSummary": {"blocos": [{"acordes": ["G", "C"]}]}, "confianca": "media"}
    catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=data), 0.97))
    result = IaService(ExplodingProvider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="Asa Branca", modoGeracao="conhecimento_modelo"))
    assert result.titulo == "Asa Branca"


def test_ia_service_ignores_low_score_match():
    calls = []
    class Provider:
        def generate(self, *args, **kwargs):
            calls.append(1)
            return ResumoHarmonicoResponse.model_validate({"titulo": "X", "harmonicSummary": {"blocos": [{"acordes": ["C", "G"]}]}, "confianca": "media"})
    catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data={}), 0.5))
    from app.services.web_search import ChordSheetHit
    web_hit = ChordSheetHit("C  G\nLetra da fonte", "https://www.cifraclub.com.br/a/x/", "cifraclub")
    result = IaService(Provider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: web_hit).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="X", modoGeracao="conhecimento_modelo"))
    assert "Cifra obtida de https://www.cifraclub.com.br/a/x/; revise antes de salvar." in result.observacoes
    assert result.harmonicSummary.blocos[0].acordes == ["C", "G"] and not calls


def test_own_library_has_priority_over_shared_catalog(client, app):
    other = register(client, "shared-c", "C")
    client.put("/api/library/songs/x", headers=auth(other), json={"songData": ai_song()})
    token = register(client, "shared-d", "D")
    mine = ai_song(aiGenerated=False, sourceInfo={"type": "upload"}, originalKey="A")
    client.put("/api/library/songs/mine", headers=auth(token), json={"songData": mine})
    found = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=luiz%20gonzaga", headers=auth(token)).get_json()["match"]
    assert found["source"] == "personal" and found["clientId"] == "mine" and found["songData"]["tom"] == "A"
    shared = client.get("/api/shared-songs/search?title=Asa%20Branca&artist=luiz%20gonzaga", headers=auth(other)).get_json()["match"]
    assert shared["source"] == "personal" and shared["clientId"] == "x"
    third = register(client, "shared-e", "E")
    assert client.get("/api/shared-songs/search?title=Asa%20Branca", headers=auth(third)).get_json()["match"]["source"] == "shared"
    with app.app_context():
        assert client.get("/api/shared-songs/search?title=Asa%20Branca&artist=Outro", headers=auth(token)).get_json()["match"]["source"] == "shared"


def test_ia_service_prefers_personal_song_over_catalog():
    # Cópia pessoal completa: o catálogo nem é consultado.
    personal_data = {"titulo": "Minha", "harmonicSummary": {"blocos": [{"acordes": ["A", "D"]}]}, "confianca": "media",
                     "fullChordSheet": {"source": "user_text", "content": "A D\nMinha letra"}}
    catalog = SimpleNamespace(
        search_personal=lambda user_id, title, artist: SimpleNamespace(summary=personal_data) if user_id == "u1" else None,
        search=lambda title, artist: (_ for _ in ()).throw(AssertionError("catálogo não deveria ser consultado")),
    )
    result = IaService(ExplodingProvider(), shared_songs=catalog).generate(ResumoHarmonicoRequest(tipo="pesquisa", titulo="Minha", modoGeracao="conhecimento_modelo"), user_id="u1")
    assert result.titulo == "Minha" and result.fullChordSheet.content == "A D\nMinha letra"
    # Cópia pessoal só com resumo e catálogo sem nada melhor: continua a do usuário.
    summary_only = {**personal_data, "fullChordSheet": None}
    catalog2 = SimpleNamespace(search_personal=lambda *a: SimpleNamespace(summary=summary_only), search=lambda *a: None)
    web_calls = []
    result2 = IaService(ExplodingProvider(), shared_songs=catalog2, web_search=lambda *a: None, sheet_finder=lambda *a: web_calls.append(1)).generate(
        ResumoHarmonicoRequest(tipo="pesquisa", titulo="Minha", modoGeracao="conhecimento_modelo"), user_id="u1")
    assert result2.titulo == "Minha" and web_calls == [1], "sem letra em lugar nenhum: tenta a web uma vez e devolve o resumo"


def test_personal_match_matches_ai_response_format(client):
    token = register(client, "shared-f", "F")
    song = {
        "title": "Minha Canção", "artist": "Eu", "key": "D", "originalKey": "C", "capo": "2",
        "fullChordSheet": {"visibility": "private", "source": "user_upload", "content": "[Intro]\nD A\n[Refrão 2]\nG D\nCantando alto hoje com a banda toda aqui",
                           "sections": [
                               {"nome": "Intro", "linhas": [{"letra": "", "acordes": [{"acorde": "D", "posicao": 0}, {"acorde": "A", "posicao": 3}]}]},
                               {"nome": "Refrão 2", "linhas": [
                                   {"letra": "", "acordes": []},
                                   {"letra": "Cantando alto hoje com a banda toda aqui", "acordes": [{"acorde": "G", "posicao": 0}, {"acorde": "D", "posicao": 9}]},
                               ]},
                           ]},
    }
    client.put("/api/library/songs/minha", headers=auth(token), json={"songData": song})
    data = client.get("/api/shared-songs/search?title=minha%20cancao&artist=eu", headers=auth(token)).get_json()["match"]["songData"]
    assert data["tom"] == "D" and data["capotraste"] == 2 and data["confianca"] == "alta"
    assert data["observacoes"] == ["Encontrada na sua biblioteca pessoal."]
    assert data["harmonicSummary"]["blocos"] == [
        {"acordes": ["D", "A"], "repeticoes": None, "fraseGuia": None, "secao": "Intro"},
        {"acordes": ["G", "D"], "repeticoes": None, "fraseGuia": "Cantando alto hoje com a banda toda aqui", "secao": "Refrão"},
    ]
    assert data["fullChordSheet"]["source"] == "user_upload"
    assert data["fullChordSheet"]["content"] == song["fullChordSheet"]["content"]
    assert data["fullChordSheet"]["sections"][1]["linhas"][1]["letra"] == "Cantando alto hoje com a banda toda aqui"


def _with_sheet(source, **overrides):
    return ai_song(fullChordSheet={"source": source, "visibility": "private", "content": "G C\nLetra completa da música"}, **overrides)


def test_web_scraped_song_goes_to_catalog_with_full_sheet_and_source(client, app):
    """Decisão de 29/09/2026: cifra da web (Cifra Club) também é compartilhada, com o link da fonte."""
    token = register(client, "shared-web", "W")
    song = _with_sheet("web_source", sourceInfo={"type": "online", "name": "Cifra Club", "url": None},
                       notes="Confiança da IA: média.\nCifra obtida de https://www.cifraclub.com.br/luiz-gonzaga/asa-branca/; revise antes de salvar.")
    client.put("/api/library/songs/web", headers=auth(token), json={"songData": song})
    with app.app_context():
        stored = SharedSong.query.one()
        assert stored.song_data["fullChordSheet"]["content"] == "G C\nLetra completa da música"
        assert stored.song_data["fullChordSheet"]["source"] == "web_source"
        assert "Fonte: https://www.cifraclub.com.br/luiz-gonzaga/asa-branca/" in stored.song_data["observacoes"]


def test_summary_only_catalog_entry_is_completed_when_saved_again_with_sheet(client, app):
    """Caso real: música entrou no catálogo só com resumo; ao salvar de novo com a cifra, fica completa."""
    token = register(client, "shared-upgrade", "U")
    client.put("/api/library/songs/up1", headers=auth(token), json={"songData": ai_song()})
    with app.app_context():
        assert SharedSong.query.one().song_data["fullChordSheet"] is None
    client.put("/api/library/songs/up1", headers=auth(token), json={"songData": _with_sheet("web_source")})
    with app.app_context():
        assert SharedSong.query.one().song_data["fullChordSheet"]["content"] == "G C\nLetra completa da música"
    friend = register(client, "shared-friend", "F")
    found = client.get("/api/shared-songs/search?title=asa%20branca&artist=Luiz%20Gonzaga", headers=auth(friend)).get_json()
    assert found["match"]["title"] == "Asa Branca"


def test_ai_generated_lyrics_never_go_to_catalog(client, app):
    token = register(client, "shared-ai", "I")
    client.put("/api/library/songs/ai", headers=auth(token), json={"songData": _with_sheet("model_knowledge")})
    with app.app_context():
        assert SharedSong.query.one().song_data["fullChordSheet"] is None


def test_user_uploaded_sheet_keeps_full_lyrics_in_catalog(client, app):
    token = register(client, "shared-up", "U")
    client.put("/api/library/songs/up", headers=auth(token), json={"songData": _with_sheet("user_upload", sourceInfo={"type": "upload"})})
    with app.app_context():
        assert SharedSong.query.one().song_data["fullChordSheet"]["content"] == "G C\nLetra completa da música"


def test_catalog_serves_web_lyrics_but_not_ai_lyrics():
    def serve(source):
        data = {"titulo": "Asa Branca", "artista": "Luiz Gonzaga", "tom": "G", "confianca": "media",
                "harmonicSummary": {"blocos": [{"acordes": ["G", "C"]}]},
                "fullChordSheet": {"source": source, "content": "G C\nLetra"}}
        catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=data), 0.97))
        return IaService(ExplodingProvider(), shared_songs=catalog).generate(
            ResumoHarmonicoRequest(tipo="pesquisa", titulo="Asa Branca", modoGeracao="conhecimento_modelo"))
    assert serve("web_source").fullChordSheet.content == "G C\nLetra"
    assert serve("model_knowledge").fullChordSheet is None


def test_old_ai_only_drafts_do_not_go_to_catalog(client, app):
    token = register(client, "shared-old-ai", "O")
    song = ai_song(notes="Confiança da IA: média.\nGerado somente por IA, sem fonte autorizada; exige revisão humana antes de salvar.")
    client.put("/api/library/songs/old-ai", headers=auth(token), json={"songData": song})
    with app.app_context():
        assert SharedSong.query.count() == 0


def test_summary_only_catalog_song_is_completed_from_web_on_search():
    """Caso real (Isaías 9): catálogo só com resumo -> a busca completa com a cifra da web."""
    from app.services.web_search import ChordSheetHit
    data = {"titulo": "Isaías 9", "artista": "Rodolfo Abrantes", "tom": "D", "confianca": "media",
            "harmonicSummary": {"blocos": [{"acordes": ["C", "G4", "Am"]}]}, "fullChordSheet": None}
    catalog = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=data), 0.97))
    hit = ChordSheetHit("[Intro] C  G4  Am\n\n[Primeira Parte]\nC      G4   Am\nUm menino nasceu", "https://www.cifraclub.com.br/rodolfo-abrantes/isaias-9/", "cifraclub", key="D", shape_key="C", capo=2)
    request = ResumoHarmonicoRequest(tipo="pesquisa", titulo="Isaías 9", artista="Rodolfo Abrantes", modoGeracao="conhecimento_modelo")
    result = IaService(ExplodingProvider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: hit).generate(request)
    assert "Um menino nasceu" in result.fullChordSheet.content and result.fullChordSheet.source == "web_source"
    # sem cifra na web (ou limite do dia): devolve o resumo do catálogo, sem erro
    fallback = IaService(ExplodingProvider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: None).generate(request)
    assert fallback.fullChordSheet is None and fallback.harmonicSummary.blocos[0].acordes == ["C", "G4", "Am"]
    limited = IaService(ExplodingProvider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: hit, web_quota=lambda user: False).generate(request)
    assert limited.fullChordSheet is None
    # catálogo já completo: não gasta scraper
    full = {**data, "fullChordSheet": {"source": "user_text", "content": "C G\nLetra"}}
    calls = []
    catalog_full = SimpleNamespace(search_personal=lambda *a: None, search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=full), 0.97))
    IaService(ExplodingProvider(), shared_songs=catalog_full, web_search=lambda *a: None, sheet_finder=lambda *a: calls.append(1)).generate(request)
    assert calls == []


def test_catalog_keeps_capo_saved_as_text(client, app):
    """O app salva 'Capotraste casa 2'; o catálogo perdia o capo (só aceitava número)."""
    from app.services.shared_songs_service import parse_capo
    assert [parse_capo(v) for v in (2, "2", "Capotraste casa 2", "2ª casa", "", None, "Sem", 0, 13)] == [2, 2, 2, 2, None, None, None, None, None]
    token = register(client, "shared-capo", "C")
    client.put("/api/library/songs/capo1", headers=auth(token), json={"songData": ai_song(title="Isaías 9", artist="Rodolfo Abrantes", originalKey="D", capo="Capotraste casa 2")})
    with app.app_context():
        stored = SharedSong.query.one()
        assert stored.song_data["capotraste"] == 2 and stored.capo == "2"


def test_own_summary_only_copy_uses_catalog_full_sheet_before_web():
    """Completar cifra: a cópia do usuário só tem resumo, o catálogo tem a letra -> usa o catálogo, sem scraper."""
    personal_data = {"titulo": "Isaías 9", "artista": "Rodolfo Abrantes", "tom": "D", "confianca": "media",
                     "harmonicSummary": {"blocos": [{"acordes": ["C", "G4", "Am"]}]}, "fullChordSheet": None}
    shared_data = {**personal_data, "fullChordSheet": {"source": "web_source", "content": "C G4 Am\nUm menino nasceu"}}
    calls = []
    catalog = SimpleNamespace(search_personal=lambda *a: SimpleNamespace(summary=personal_data),
                              search=lambda title, artist: SharedSongMatch(SimpleNamespace(song_data=shared_data), 0.97))
    result = IaService(ExplodingProvider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: calls.append(1)).generate(
        ResumoHarmonicoRequest(tipo="pesquisa", titulo="Isaías 9", artista="Rodolfo Abrantes", modoGeracao="conhecimento_modelo"), user_id="u1")
    assert "Um menino nasceu" in result.fullChordSheet.content and calls == []


def test_summary_only_personal_song_has_no_fake_full_sheet(client, app):
    """Música salva só com resumo não vira "Letra + Cifras": o Completar cifra precisa ir ao catálogo/Cifra Club."""
    from app.services.shared_songs_service import SharedSongService
    token = register(client, "personal-sum", "P")
    client.put("/api/library/songs/casa", headers=auth(token), json={"songData": ai_song(title="A casa é sua", artist="Casa Worship")})
    with app.app_context():
        match = SharedSongService.search_personal("personal-sum", "A casa é sua", "Casa Worship")
        assert match is not None
        assert match.summary["fullChordSheet"] is None
        assert match.summary["harmonicSummary"]["blocos"][0]["acordes"] == ["G", "C"]


def test_base_library_song_completed_with_real_lyrics_reaches_catalog(client, app):
    """Força-tarefa: música da biblioteca base (origem manual) completada pelo Cifra Club ou arquivo vai ao catálogo."""
    token = register(client, "task-a", "A")
    base = {"type": "manual", "name": "PDF fornecido pelo usuário", "url": None}
    web = {"source": "web_source", "content": "G  C\nVocê é bem vindo aqui", "sections": []}
    typed = {"source": "user_text", "content": "G  C\nMinha versão", "sections": []}
    client.put("/api/library/songs/web", headers=auth(token), json={"songData": ai_song(title="A casa é sua", sourceInfo=base, fullChordSheet=web)})
    client.put("/api/library/songs/txt", headers=auth(token), json={"songData": ai_song(title="Digitada", sourceInfo=base, fullChordSheet=typed)})
    with app.app_context():
        songs = {song.title: song for song in SharedSong.query.all()}
        assert list(songs) == ["A casa é sua"]
        assert songs["A casa é sua"].song_data["fullChordSheet"]["content"].endswith("bem vindo aqui")


def test_teammate_completion_updates_summary_only_catalog_entry(client, app):
    """Colega completa uma música que estava no catálogo só com resumo: o catálogo passa a ter a letra."""
    first, second = register(client, "task-b", "B"), register(client, "task-c", "C")
    client.put("/api/library/songs/s", headers=auth(first), json={"songData": ai_song(title="Ousado Amor")})
    web = {"source": "web_source", "content": "G  C\nAntes de eu falar", "sections": []}
    client.put("/api/library/songs/s", headers=auth(second), json={"songData": ai_song(title="Ousado Amor", fullChordSheet=web)})
    with app.app_context():
        assert SharedSong.query.one().song_data["fullChordSheet"]["source"] == "web_source"


def test_complete_button_is_told_when_daily_web_limit_is_reached():
    """Cópia só com resumo + limite do dia esgotado: devolve o resumo com o aviso de limite (sem chamar o scraper)."""
    from app.services.ia_service import WEB_QUOTA_NOTE
    personal_data = {"titulo": "Isaías 9", "artista": "Rodolfo Abrantes", "tom": "D", "confianca": "media",
                     "harmonicSummary": {"blocos": [{"acordes": ["C", "G4", "Am"]}]}, "fullChordSheet": None}
    calls = []
    catalog = SimpleNamespace(search_personal=lambda *a: SimpleNamespace(summary=personal_data), search=lambda *a: None)
    result = IaService(ExplodingProvider(), shared_songs=catalog, web_search=lambda *a: None, sheet_finder=lambda *a: calls.append(1),
                       web_quota=lambda user_id: False).generate(
        ResumoHarmonicoRequest(tipo="pesquisa", titulo="Isaías 9", artista="Rodolfo Abrantes", modoGeracao="conhecimento_modelo"), user_id="u1")
    assert result.fullChordSheet is None and WEB_QUOTA_NOTE in result.observacoes and calls == []
