import pytest

from app.errors import ApiError
from app.schemas.resumo_harmonico import ResumoHarmonicoResponse, TrechoHarmonico
from app.services.harmonic_normalizer import (
    canonicalize_chord,
    normalize_chord,
    normalize_response,
)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("B4", "Bsus4"),
        ("A4", "Asus4"),
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


def test_unreliable_empty_result_is_rejected():
    result = ResumoHarmonicoResponse(
        titulo="Desconhecida",
        artista=None,
        tom=None,
        trechos=[],
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
        trechos=[TrechoHarmonico(acordes=["F", "Am", "G", "F", "Am", "G"])],
        confianca="alta",
    )
    normalized = normalize_response(result, "arquivo")
    assert normalized.trechos[0].acordes == ["F", "Am", "G"]
    assert normalized.trechos[0].repeticoes == 2


def test_non_identical_structure_is_not_compressed():
    result = ResumoHarmonicoResponse(
        titulo="Estrutura variável",
        tom="C",
        trechos=[TrechoHarmonico(acordes=["F", "G", "F", "G", "F", "Am", "G", "Em", "F"])],
        confianca="alta",
    )
    normalized = normalize_response(result, "arquivo")
    assert normalized.trechos[0].acordes == ["F", "G", "F", "G", "F", "Am", "G", "Em", "F"]
    assert normalized.trechos[0].repeticoes is None
