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
    assert (result.tom, result.capotraste) == ("C", 2)
    assert result.harmonicSummary.blocos[0].acordes == ["C", "G4", "Am"] and result.harmonicSummary.blocos[0].repeticoes == 2
    assert result.observacoes[0] == "Tom real: D (forma de C, capotraste na 2ª casa)."


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
        ("Intro", None, ["C", "G4", "Am"], 2),
        ("Primeira Parte", "Um menino nasceu", ["C", "G4", "Am"], None),
        ("Pré-Refrão", "E o Seu nome é", ["F7M", "Am", "Dm", "F7M", "Am", "G"], None),
        ("Refrão", "O céu começa a se abrir", ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
        ("Solo", None, ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
        ("Segunda Parte", "Santo, Santo, Santo é o Senhor", ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"], None),
    ]
    assert (result.tom, result.capotraste) == ("C", 2)
