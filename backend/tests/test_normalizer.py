import pytest

from app.errors import ApiError
from app.schemas.resumo_harmonico import AcordePosicionado, CifraCompleta, LinhaCifraCompleta, ResumoEstruturado, ResumoHarmonicoResponse, SecaoCifraCompleta, TrechoHarmonico
from app.services.harmonic_normalizer import (
    canonicalize_chord,
    normalize_chord,
    normalize_response,
    render_full_chord_sheet,
    split_chord_token,
)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("B4", "Bsus4"),
        ("A4", "Asus4"),
        ("B2", "B2"),
        ("Db", "Db"),
        ("Gb/Bb", "Gb/Bb"),
        ("F#m7(11)", "F#m7(11)"),
        ("D/F#", "D/F#"),
        ("C7M", "Cmaj7"),
    ],
)
def test_normalize_chord(source, expected):
    assert normalize_chord(source) == expected


def test_canonical_form_is_available_without_changing_display_spelling():
    assert canonicalize_chord("Db") == "C#"
    assert canonicalize_chord("Gb/Bb") == "F#/A#"
    assert canonicalize_chord("B2") == "Bsus2"


def test_concatenated_chords_are_split_without_changing_notation():
    assert split_chord_token("C#m7B2F#mA9") == ["C#m7", "B2", "F#m", "A9"]
    assert split_chord_token("C#m7E/G#A9B2") == ["C#m7", "E/G#", "A9", "B2"]


def test_batendo_a_porta_fidelity_sections_hooks_and_repetition():
    repeated_lines = [LinhaCifraCompleta(
        letra="Estamos batendo à porta",
        acordes=[AcordePosicionado(acorde="C#m7B2F#mA9", posicao=0)],
    ) for _ in range(4)]
    result = ResumoHarmonicoResponse(
        titulo="Batendo à Porta", artista="Florianópolis House Of Prayer (fhop music)", tom="C#m",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(
            acordes=["C#m7B2F#mA9"], repeticoes=4,
            fraseGuia="Estamos batendo à porta", secao="Trecho 2",
        )]),
        fullChordSheet=CifraCompleta(source="user_upload", content="[reconstruir]", sections=[SecaoCifraCompleta(nome=None, linhas=repeated_lines)]),
        confianca="alta",
    )
    normalized = normalize_response(result, "arquivo")
    block = normalized.harmonicSummary.blocos[0]
    assert block.acordes == ["C#m7", "B2", "F#m", "A9"]
    assert block.repeticoes == 4
    assert block.fraseGuia == "Estamos batendo à porta"
    assert block.secao is None
    assert [item.acorde for item in normalized.fullChordSheet.sections[0].linhas[0].acordes] == ["C#m7", "B2", "F#m", "A9"]


def test_hook_must_exist_in_same_known_section_and_unverified_repeat_is_removed():
    sheet = CifraCompleta(source="user_upload", content="[reconstruir]", sections=[SecaoCifraCompleta(
        nome="Refrão", linhas=[LinhaCifraCompleta(letra="Frase real do refrão", acordes=[AcordePosicionado(acorde="D", posicao=0), AcordePosicionado(acorde="A", posicao=4)])]
    )])
    result = ResumoHarmonicoResponse(
        titulo="Na Sua Estante", tom="D", fullChordSheet=sheet, confianca="media",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(acordes=["D", "A"], repeticoes=4, fraseGuia="Texto inventado", secao="Refrão")]),
    )
    normalized = normalize_response(result, "arquivo")
    assert normalized.harmonicSummary.blocos[0].fraseGuia is None
    assert normalized.harmonicSummary.blocos[0].repeticoes is None


def test_visual_full_sheet_is_rebuilt_from_positions_without_concatenating_chords():
    sheet = CifraCompleta(source="user_upload", content="[reconstruir]", sections=[SecaoCifraCompleta(
        nome="Intro", linhas=[LinhaCifraCompleta(letra="Aqui na terra como no céu", acordes=[AcordePosicionado(acorde="F", posicao=0), AcordePosicionado(acorde="Am", posicao=8), AcordePosicionado(acorde="G", posicao=15)])]
    )])
    rendered = render_full_chord_sheet(sheet)
    assert rendered == "[Intro]\nF       Am     G\nAqui na terra como no céu"
    assert "FAmG" not in rendered


def test_unreliable_empty_result_is_rejected():
    result = ResumoHarmonicoResponse(
        titulo="Desconhecida",
        artista=None,
        tom=None,
        harmonicSummary=ResumoEstruturado(blocos=[]),
        observacoes=["Não há dados suficientes."],
        confianca="baixa",
    )
    with pytest.raises(ApiError) as error:
        normalize_response(result, "pesquisa")
    assert error.value.code == "resultado_nao_confiavel"


def test_guide_is_limited_to_eight_words():
    trecho = TrechoHarmonico(
        acordes=["C"],
        fraseGuia="um dois três quatro cinco seis sete oito nove dez onze doze treze quatorze",
    )
    assert len(trecho.fraseGuia.split()) == 8


def test_exact_repeated_progression_is_safely_compressed():
    result = ResumoHarmonicoResponse(
        titulo="Cultura do Céu",
        tom="C",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(acordes=["F", "Am", "G", "F", "Am", "G"])]),
        confianca="alta",
    )
    normalized = normalize_response(result, "arquivo")
    assert normalized.harmonicSummary.blocos[0].acordes == ["F", "Am", "G"]
    assert normalized.harmonicSummary.blocos[0].repeticoes == 2


def test_non_identical_structure_is_not_compressed():
    result = ResumoHarmonicoResponse(
        titulo="Estrutura variável",
        tom="C",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(acordes=["F", "G", "F", "G", "F", "Am", "G", "Em", "F"])]),
        confianca="alta",
    )
    normalized = normalize_response(result, "arquivo")
    assert normalized.harmonicSummary.blocos[0].acordes == ["F", "G", "F", "G", "F", "Am", "G", "Em", "F"]
    assert normalized.harmonicSummary.blocos[0].repeticoes is None


def test_exact_progression_can_be_compressed_three_times():
    result = ResumoHarmonicoResponse(
        titulo="Repetição segura",
        tom="D",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(acordes=["D", "Bm", "D", "Bm", "D", "Bm"])]),
        confianca="alta",
    )
    normalized = normalize_response(result, "texto")
    assert normalized.harmonicSummary.blocos[0].acordes == ["D", "Bm"]
    assert normalized.harmonicSummary.blocos[0].repeticoes == 3
