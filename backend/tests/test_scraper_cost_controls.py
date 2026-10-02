"""Custo-benefício do MVP: montagem local da cifra da web, interruptor, sem Google e limite por usuário."""
import pytest

from app.errors import ApiError
from app.schemas.resumo_harmonico import ResumoHarmonicoRequest
from app.services import web_search
from app.services.ia_service import IaService
from app.services.local_sheet_parser import parse_chord_sheet
from app.services.music_sources import MusicSourceUnavailable
from app.services.web_search import ChordSheetHit

ISAIAS = """[Intro]  C  G4(6)  Am
         C  G4(6)  Am

[Primeira Parte]

C      G4(6)   Am
Um menino nasceu
          C       G4(6)   Am
Como um filho se nos deu

[Pré-Refrão]

F7M          Am     Dm
    E o Seu nome é    maravilhoso

[Tab - Solo]
E|----------------|
B|---1---3--------|
"""


class NoAI:
    def generate(self, *args, **kwargs):
        raise AssertionError("A IA não deve ser chamada")


def request():
    return ResumoHarmonicoRequest(tipo="pesquisa", titulo="Isaías 9", artista="Rodolfo Abrantes", modoGeracao="conhecimento_modelo")


def test_local_parser_builds_sections_blocks_and_positions():
    result = parse_chord_sheet(ISAIAS, "Isaías 9", "Rodolfo Abrantes", key="C")
    names = [section.nome for section in result.fullChordSheet.sections]
    assert names == ["Intro", "Primeira Parte", "Pré-Refrão"]  # tablatura fica de fora
    verse = result.fullChordSheet.sections[1].linhas[0]
    assert verse.letra == "Um menino nasceu" and [(a.acorde, a.posicao) for a in verse.acordes] == [("C", 0), ("G4", 7), ("Am", 15)]
    assert result.harmonicSummary.blocos[2].fraseGuia == "E o Seu nome é"
    assert result.tom == "C"


def test_web_sheet_is_built_without_ai_and_uses_page_key_and_capo():
    hit = ChordSheetHit(ISAIAS, "https://www.cifraclub.com.br/rodolfo-abrantes/isaias-9/", "cifraclub", key="D", shape_key="C", capo=2)
    result = IaService(NoAI(), web_search=lambda *a: None, sheet_finder=lambda *a: hit).generate(request())
    assert (result.tom, result.capotraste) == ("D", 2)
    assert result.harmonicSummary.blocos[0].acordes == ["C", "G4", "Am"] and result.harmonicSummary.blocos[0].repeticoes == 2
    assert result.observacoes[0] == "Tom: D (acordes na forma de C, capotraste na 2ª casa)."


def test_kill_switch_disables_web_search(app):
    app.config.update(SCRAPER_ENABLED=False, DEEPSEEK_API_KEY="x")
    service = IaService.from_config(app.config)
    service._shared_songs = None
    with pytest.raises(ApiError) as error:
        service.generate(request())
    assert error.value.code == "cifra_nao_encontrada"


def test_google_search_fallback_is_off_by_default(app):
    from app.config import Config
    assert Config.SCRAPER_SEARCH_FALLBACK is False and Config.SCRAPER_ENABLED is True
    searches = []

    class Missing:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            raise MusicSourceUnavailable("ScraperAPI retornou status 404")

    finder, _ = web_search.make_web_searchers("k", http_client=Missing(), search_fn=lambda q: searches.append(q) or [],
                                             allow_search=False)
    assert finder("Música", "Artista") is None and searches == []


def test_daily_web_limit_per_user_asks_for_file():
    allowed = iter([True, False])
    hit = ChordSheetHit(ISAIAS, "https://www.cifraclub.com.br/rodolfo-abrantes/isaias-9/", "cifraclub")
    service = IaService(NoAI(), web_search=lambda *a: None, sheet_finder=lambda *a: hit, web_quota=lambda user: next(allowed))
    service.generate(request(), user_id="u1")
    with pytest.raises(ApiError) as error:
        service.generate(request(), user_id="u1")
    assert error.value.code == "limite_busca_web" and error.value.status_code == 429


def test_summary_follows_roudy_standard_for_real_sheet():
    """Padrão ROUDY: seção + frase-guia curta + uma volta da progressão; seção repetida aparece uma vez."""
    from pathlib import Path
    text = (Path(__file__).parent / "fixtures" / "cifraclub_isaias_9.txt").read_text(encoding="utf-8")
    hit = ChordSheetHit(text, "https://www.cifraclub.com.br/rodolfo-abrantes/isaias-9/", "cifraclub", key="D", shape_key="C", capo=2)
    result = IaService(NoAI(), web_search=lambda *a: None, sheet_finder=lambda *a: hit).generate(request())
    summary = [(b.secao, b.fraseGuia, b.acordes, b.repeticoes) for b in result.harmonicSummary.blocos]
    assert summary == [
        (None, None, ["C", "G4", "Am"], 2),
        (None, "Um menino nasceu", ["C", "G4", "Am"], None),
        (None, "E o Seu nome é", ["F7M", "Am", "Dm", "F7M", "Am", "G"], None),
        (None, "O céu começa a se abrir", ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
        (None, None, ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
        (None, "Santo, Santo, Santo é o Senhor", ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
    ], "padrão ROUDY: sem nomes de seção, só acordes e frases-gancho"
    assert (result.tom, result.capotraste) == ("D", 2)


def test_key_is_estimated_from_chords_plus_capo_when_page_hides_it():
    """Cifra Club monta o 'Tom: D' por JavaScript; o capotraste vem no HTML. C (forma) + capo 2 = D."""
    from pathlib import Path
    text = (Path(__file__).parent / "fixtures" / "cifraclub_isaias_9.txt").read_text(encoding="utf-8")
    hit = ChordSheetHit(text, "https://www.cifraclub.com.br/rodolfo-abrantes/isaias-9/", "cifraclub", capo=2)
    result = IaService(NoAI(), web_search=lambda *a: None, sheet_finder=lambda *a: hit).generate(request())
    assert (result.tom, result.capotraste) == ("D", 2)
    assert result.harmonicSummary.blocos[0].acordes == ["C", "G4", "Am"]
    assert "tom estimado pelos acordes" in result.observacoes[0]


def test_key_found_in_page_data_attributes():
    html = '<div id="app" data-key="D"></div><div>Capotraste: 2ª casa</div><pre>C G Am</pre>'
    assert web_search.extract_sheet_metadata(html) == {"key": "D", "capo": 2}
    html_json = '<script>window.cifra = {"tom":"D","forma":"C"}</script><p>Capotraste: 2ª casa</p>'
    assert web_search.extract_sheet_metadata(html_json) == {"key": "D", "shape_key": "C", "capo": 2}


def test_song_with_featuring_in_cifraclub_slug_is_found_via_artist_list():
    """Cifra Club: "A Boa Parte" fica em /a-boa-parte-part-florianopolis-house-of-prayer/; o endereço direto dá 404."""
    calls = []
    real = "https://www.cifraclub.com.br/nivea-soares/a-boa-parte-part-florianopolis-house-of-prayer/"
    listing = ('<a href="/nivea-soares/a-boa-parte-ao-vivo/">ao vivo</a>'
               f'<a href="{real}">A Boa Parte</a><a href="/nivea-soares/a-boa-noticia/">outra</a>')
    page = "<html><body><pre>[Intro] E  B\n\nE        B\nA boa parte escolhi</pre></body></html>"

    class Site:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            calls.append(url)
            if url.endswith("/musicas.html"):
                return listing, url
            if url == real:
                return page, url
            raise MusicSourceUnavailable("ScraperAPI retornou status 404")

    finder, _ = web_search.make_web_searchers("k", http_client=Site(), search_fn=lambda q: [], allow_search=False)
    hit = finder("A Boa parte", "Nívea Soares")
    assert hit is not None and hit.url == real and "A boa parte escolhi" in hit.content
    assert calls[-2:] == ["https://www.cifraclub.com.br/nivea-soares/musicas.html", real]


def test_artist_list_without_matching_song_gives_up_cheaply():
    calls = []

    class Site:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            calls.append(url)
            if url.endswith("/musicas.html"):
                return '<a href="/artista/outra-musica/">x</a>', url
            raise MusicSourceUnavailable("ScraperAPI retornou status 404")

    finder, _ = web_search.make_web_searchers("k", http_client=Site(), search_fn=lambda q: [], allow_search=False)
    assert finder("Música", "Artista") is None
    assert sum(url.endswith("/musicas.html") for url in calls) == 1


def test_cifraclub_slug_typo_is_found_by_visible_title():
    """Cifra Club: "Que Se Abram Os Céus" fica em /que-se-abra-os-ceus/ (erro no endereço deles)."""
    real = "https://www.cifraclub.com.br/nivea-soares/que-se-abra-os-ceus/"
    listing = ('<a href="/nivea-soares/que-se-abra-os-ceus/"><span>Que Se Abram Os Céus</span></a>'
               '<a href="/nivea-soares/a-boa-noticia/">A Boa Notícia</a>')
    page = "<html><body><pre>[Intro] A  E\n\nA        E\nQue se abram os céus</pre></body></html>"

    class Site:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            if url.endswith("/musicas.html"):
                return listing, url
            if url == real:
                return page, url
            raise MusicSourceUnavailable("ScraperAPI retornou status 404")

    finder, _ = web_search.make_web_searchers("k", http_client=Site(), search_fn=lambda q: [], allow_search=False)
    hit = finder("que se abram os céus", "Nívea soares")
    assert hit is not None and hit.url == real


def test_artist_list_does_not_pick_a_different_song():
    listing = '<a href="/nivea-soares/a-boa-noticia/">A Boa Notícia</a><a href="/nivea-soares/ousado-amor/">Ousado Amor</a>'

    class Site:
        def get_text(self, url, *, allowed_hosts, allowed_content_types):
            return listing, url

    assert web_search._artist_song_url("A Boa Parte", "Nívea Soares", Site()) is None
