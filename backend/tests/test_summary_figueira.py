"""Caso real (30/10/2026): resumo de "Ainda que a figueira" bagunçado; "Teu Amor Não Falha" já estava certo."""
from app.schemas.resumo_harmonico import ResumoHarmonicoResponse
from app.services.harmonic_normalizer import ensure_client_chords
from app.services.ia_service import summary_off_standard


def response(blocks, title="Música"):
    return ResumoHarmonicoResponse.model_validate({
        "titulo": title, "artista": None, "tom": None, "confianca": "media",
        "harmonicSummary": {"blocos": [{"acordes": chords.split(), "repeticoes": repeat, "fraseGuia": phrase} for chords, repeat, phrase in blocks]},
    })


def lines(result):
    return [(" ".join(b.acordes) + (f" ({b.repeticoes}x)" if b.repeticoes else ""), b.fraseGuia) for b in result.harmonicSummary.blocos]


FIGUEIRA = [
    ("F#m E9 Bm7 D", 2, "Tu és a minha porção"),
    ("A E9 Bm7 D", 2, "Mesmo que meus pais me deixem"),
    ("A E9 Bm7 D A E9 G D", None, "Ainda que a figueira"),
    ("Bm7 A E9 Bm7 A E9 Bm7 A E9 Bm7 A E9 D", None, None),
    ("A E9 Bm7 D A E9 G D A E9 Bm7", None, "Ainda que a figueira"),
    ("D A E9 G D A", None, "Não dê o seu fruto"),
]

TEU_AMOR = [
    ("Am F C G", 2, None),
    ("Am F C G", 2, "Nada vai me separar"),
    ("F C G Dm", 2, "Tu és o mesmo pra sempre"),
    ("F C G", None, "Porque eu sei que me amas"),
    ("F Am G", None, "Teu amor não falha"),
]


def test_figueira_is_detected_and_condensed():
    original = response(FIGUEIRA, "Ainda que a figueira")
    assert summary_off_standard(original)
    assert lines(ensure_client_chords(original)) == [
        ("F#m E9 Bm7 D (2x)", "Tu és a minha porção"),
        ("A E9 Bm7 D (2x)", "Mesmo que meus pais me deixem"),
        ("A E9 Bm7 D A E9 G D", "Ainda que a figueira"),
        ("Bm7 A E9 (4x)", None),  # o "D" solto era só o 1º acorde da linha seguinte
        ("D A E9 G D A", "Não dê o seu fruto"),
    ]


def test_teu_amor_nao_falha_stays_as_is():
    original = response(TEU_AMOR, "Teu Amor Não Falha")
    assert not summary_off_standard(original)
    assert lines(ensure_client_chords(original)) == [(c + (f" ({r}x)" if r else ""), p) for c, r, p in TEU_AMOR]


def test_same_phrase_with_other_chords_is_kept():
    """Refrão final modulado: mesma frase, outros acordes. É outra parte e continua."""
    blocks = [("G D Em C", None, "Teu amor não falha"), ("A E F#m D", None, "Teu amor não falha")]
    original = response(blocks)
    assert not summary_off_standard(original)
    assert len(ensure_client_chords(original).harmonicSummary.blocos) == 2


def test_single_chord_line_is_kept_when_next_line_starts_elsewhere():
    blocks = [("Bm7 A E9 Bm7 A E9 Bm7 A E9 Bm7 A E9 D", None, None), ("G A", None, "Outra parte")]
    assert lines(ensure_client_chords(response(blocks))) == [("Bm7 A E9 (4x)", None), ("D", None), ("G A", "Outra parte")]


LAST_KISS = [
    ("G Em C D", None, "Oh where, oh where"),
    ("Em C D G Em C D", None, "We were out on"),
    ("G Em C D", None, "I couldn't stop so"),
    ("Em C D G Em C D", None, "When I woke up"),
    ("G Em C D G", None, "I lifted her head"),
    ("Em C D G", None, "I kissed her our last kiss"),
]


def test_last_kiss_whole_song_is_one_loop():
    """Simplificando cifras (31/10/2026): a música inteira é G Em C D, então o resumo é uma linha."""
    original = response(LAST_KISS, "Last Kiss")
    assert summary_off_standard(original)
    assert lines(ensure_client_chords(original)) == [("G Em C D", "Oh where, oh where")]


def test_loop_merge_keeps_different_progressions_apart():
    blocks = [("G Em C D", None, "Primeira frase"), ("D C G", None, "Outra parte"), ("Em C D G", None, "Volta o começo")]
    assert lines(ensure_client_chords(response(blocks))) == [("G Em C D", "Primeira frase"), ("D C G", "Outra parte"), ("Em C D G", "Volta o começo")]


def test_same_loop_same_phrase_adds_up():
    blocks = [("G Em C D", 2, "Oh where"), ("Em C D G", None, "Oh where")]
    assert lines(ensure_client_chords(response(blocks))) == [("G Em C D (3x)", "Oh where")]
