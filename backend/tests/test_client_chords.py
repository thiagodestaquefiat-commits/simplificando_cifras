"""Acordes originais preservados e backend alinhado ao frontend.

Contexto: a Busca por IA falhava com "O servidor retornou um acorde inválido" quando a cifra
(do Cifra Club ou do DeepSeek) trazia notação como A7(9), E7(4) ou Am13 — aceita pelo backend,
rejeitada pelo parseChord do frontend, que então descartava a resposta inteira.
A grafia original deve ser mantida; o frontend usa o equivalente só para o diagrama.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.schemas.resumo_harmonico import ResumoHarmonicoResponse
from app.services.harmonic_normalizer import (
    ensure_client_chords, is_client_chord, normalize_chord, normalize_response, simplify_chord_text,
    split_chord_token,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
ORIGINAL_CHORDS = ["A7(9)", "E7(4)", "E7(4/9)", "C7(9-)", "C7(13)", "G7(#9)", "D7(b9)", "Cmaj7(9)",
                   "C7M(9)", "A7M", "Am7(9)", "Am7(11)", "Bm7(b5)", "F#m7(5-)", "Am13", "Am(add9)",
                   "Am(7M)", "C(9)", "A4", "B2", "A9", "C#m7", "E/G#", "A7(9)/C#", "Bb"]
REJECTED = ["Lá", "Sol", "Ré", "Dó", "C(xyz)", "Cfoo", "H7"]


SIMPLIFIED = {"A7(9)": "A7", "E7(4)": "E7", "E7(4/9)": "E7", "C7(9-)": "C7", "C7(13)": "C7",
              "G7(#9)": "G7", "Cmaj7(9)": "Cmaj7", "C7M(9)": "C7M", "Am7(9)": "Am7", "Am7(11)": "Am7",
              "Bm7(b5)": "Bm7", "Am(add9)": "Am", "Am(7M)": "Am", "C(9)": "C", "A7(9)/C#": "A7/C#"}


@pytest.mark.parametrize("chord", ORIGINAL_CHORDS)
def test_chords_are_accepted_and_valid_for_the_app(chord):
    assert is_client_chord(chord)
    assert is_client_chord(normalize_chord(chord))


@pytest.mark.parametrize("chord, expected", SIMPLIFIED.items())
def test_parenthetical_extensions_are_removed(chord, expected):
    assert normalize_chord(chord) == expected


@pytest.mark.parametrize("chord", ["A7M", "Am13", "A4", "B2", "A9", "C#m7", "E/G#", "Bb"])
def test_chords_without_parentheses_keep_original_spelling(chord):
    assert normalize_chord(chord) == chord


def test_chord_sheet_text_is_simplified_keeping_alignment_and_lyrics():
    text = "A7(9)     E7(4)    F#m  (2x)\nTudo (sobre) Você, Deus (Em)"
    assert simplify_chord_text(text) == "A7        E7       F#m  (2x)\nTudo (sobre) Você, Deus (Em)"


@pytest.mark.parametrize("chord", REJECTED)
def test_invalid_names_are_rejected(chord):
    assert not is_client_chord(chord)
    with pytest.raises(ValueError):
        normalize_chord(chord)


def test_concatenated_chords_are_still_split():
    assert split_chord_token("C#m7B2F#mA9") == ["C#m7", "B2", "F#m", "A9"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node indisponível")
def test_backend_and_frontend_accept_exactly_the_same_chords():
    tokens = ORIGINAL_CHORDS + REJECTED + ["Esus4", "Cmaj9", "Am9", "Bm7b5", "C7(xx)", "Am7(9"]
    script = f"""
      const fs = require('fs'); global.window = global; global.instrumentDefinitions = {{ all: [] }};
      eval(fs.readFileSync({json.dumps(str(REPO_ROOT / 'js/instruments/multi-instrument-chord-library.js'))}, 'utf8'));
      console.log(JSON.stringify({json.dumps(tokens)}.map(c => Boolean(global.multiInstrumentChordLibrary.parseChord(c)))));
    """
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    frontend = dict(zip(tokens, json.loads(result.stdout)))
    backend = {token: is_client_chord(token) for token in tokens}
    assert backend == frontend


def _response(chords, sheet_chords=None):
    data = {
        "schemaVersion": 2, "titulo": "Música", "artista": "Artista", "tom": "A", "capotraste": None,
        "confianca": "media", "observacoes": [],
        "harmonicSummary": {"blocos": [{"secao": None, "acordes": chords, "repeticoes": None, "fraseGuia": None}]},
        "fullChordSheet": None,
    }
    if sheet_chords is not None:
        data["fullChordSheet"] = {"source": "model_knowledge", "content": "texto", "sections": [
            {"nome": None, "linhas": [{"letra": "uma linha", "acordes": [
                {"acorde": chord, "posicao": index * 6} for index, chord in enumerate(sheet_chords)]}]}]}
    return ResumoHarmonicoResponse.model_validate(data)


def test_normalize_response_simplifies_chords():
    result = normalize_response(_response(["A7(9)", "E7(4)", "D"]), "pesquisa")
    assert result.harmonicSummary.blocos[0].acordes == ["A7", "E7", "D"]


def test_ensure_client_chords_simplifies_cached_songs_and_drops_unreadable():
    cached = _response(["A7(9)", "Lá", "D"], sheet_chords=["E7(4)", "Sol"])
    fixed = ensure_client_chords(cached)
    assert fixed.harmonicSummary.blocos[0].acordes == ["A7", "D"]
    assert [item.acorde for item in fixed.fullChordSheet.sections[0].linhas[0].acordes] == ["E7"]
    assert any("Lá" in note and "Sol" in note for note in fixed.observacoes)
