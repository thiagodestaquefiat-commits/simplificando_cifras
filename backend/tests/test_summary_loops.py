"""Laços de repetição no resumo harmônico: padrão ROUDY é uma volta + "(Nx)"."""
from app.schemas.resumo_harmonico import ResumoHarmonicoResponse
from app.services.harmonic_normalizer import ensure_client_chords
from app.services.ia_service import summary_off_standard


def summary(*blocos):
    return ResumoHarmonicoResponse.model_validate({
        "titulo": "Bom Tesouro", "artista": "Mateus Brito", "tom": "G", "confianca": "alta", "observacoes": [],
        "harmonicSummary": {"blocos": [{"acordes": a, "repeticoes": r, "fraseGuia": f} for f, a, r in blocos]}})


def rows(result):
    return [(b.fraseGuia, " ".join(b.acordes), b.repeticoes) for b in result.harmonicSummary.blocos]


BOM_TESOURO = summary(("Tudo perde o valor", ["C"], None), ("Quando estou com você", ["Bm"], None),
                      ("Nos vales ou nos montes", ["C"], None), ("Tu continuas sendo bom", ["Bm"], None),
                      ("Quando olhei para ti", ["C"], None), ("Hoje eu vivo pra ti", ["Bm"], None),
                      ("Tu és o meu bom tesouro", ["G", "D", "Em", "C"], None))


def test_alternating_blocks_become_one_line_with_repeat_count():
    assert rows(ensure_client_chords(BOM_TESOURO)) == [
        ("Tudo perde o valor", "C Bm", 3), ("Tu és o meu bom tesouro", "G D Em C", None)]


def test_same_progression_in_sequence_adds_up_repeats():
    result = ensure_client_chords(summary(("Santo", ["D", "A"], 2), (None, ["D", "A"], 2)))
    assert rows(result) == [("Santo", "D A", 4)]


def test_instrumental_intro_stays_apart_from_sung_part_with_same_chords():
    result = ensure_client_chords(summary((None, ["G", "D", "Em", "C"], None), ("Tu és fiel", ["G", "D", "Em", "C"], None)))
    assert rows(result) == [(None, "G D Em C", None), ("Tu és fiel", "G D Em C", None)]


def test_different_blocks_are_not_merged():
    result = ensure_client_chords(summary(("A", ["C"], None), ("B", ["Bm"], None), ("C", ["Am"], None)))
    assert len(result.harmonicSummary.blocos) == 3


def test_saved_summary_with_loop_is_flagged_for_organizing():
    assert summary_off_standard(BOM_TESOURO)
    assert not summary_off_standard(ensure_client_chords(BOM_TESOURO))


def test_whole_stanza_with_same_chords_but_new_hook_stays_separate():
    x = ["Am", "Em", "Am", "F7M", "C", "Em", "F7M"]
    result = ensure_client_chords(summary(("O céu começa a se abrir", x, None), ("Santo, Santo, Santo", x, None)))
    assert [b.fraseGuia for b in result.harmonicSummary.blocos] == ["O céu começa a se abrir", "Santo, Santo, Santo"]
