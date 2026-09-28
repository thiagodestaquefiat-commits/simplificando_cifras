"""Garante que o backend só devolve acordes que o frontend (parseChord) aceita.

Contexto: a Busca por IA falhava com "O servidor retornou um acorde inválido" quando a cifra
(do Cifra Club ou do DeepSeek) trazia notação como A7(9), E7(4) ou Am13 — válida para o backend,
rejeitada pelo frontend, que então descartava a resposta inteira.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.harmonic_normalizer import (
    ensure_client_chords, is_client_chord, normalize_chord, normalize_response,
)
from app.schemas.resumo_harmonico import ResumoHarmonicoResponse

REPO_ROOT = Path(__file__).resolve().parents[2]
BRAZILIAN_CHORDS = ["A7(9)", "E7(4)", "C7(13)", "G7(#9)", "D7(b9)", "Cmaj7(9)", "Am7(9)",
                    "Am7(11)", "Bm7(b5)", "Am13", "Am(add9)", "B2", "A9", "C#m7", "E/G#", "F#m7(b13)", "Bb"]


@pytest.mark.parametrize("raw, expected", [
    ("A7(9)", "A9"), ("E7(4)", "Esus4"), ("G7(#9)", "G7"), ("Cmaj7(9)", "Cmaj9"),
    ("Am7(9)", "Am9"), ("Am13", "Am7"), ("Am(add9)", "Am"),
    ("Am7(11)", "Am7(11)"), ("Bm7(b5)", "Bm7(b5)"), ("B2", "B2"), ("E/G#", "E/G#"),
])
def test_brazilian_notation_is_adapted_to_app_vocabulary(raw, expected):
    assert normalize_chord(raw) == expected
    assert is_client_chord(normalize_chord(raw))


@pytest.mark.skipif(shutil.which("node") is None, reason="node indisponível")
def test_every_normalized_chord_passes_the_real_frontend_parser():
    outputs = [normalize_chord(chord) for chord in BRAZILIAN_CHORDS]
    script = f"""
      const fs = require('fs'); global.window = global; global.instrumentDefinitions = {{ all: [] }};
      eval(fs.readFileSync({json.dumps(str(REPO_ROOT / 'js/instruments/multi-instrument-chord-library.js'))}, 'utf8'));
      const rejected = {json.dumps(outputs)}.filter(c => !global.multiInstrumentChordLibrary.parseChord(c));
      console.log(JSON.stringify(rejected));
    """
    result = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout) == []


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
                {"acorde": chord, "posicao": index * 4} for index, chord in enumerate(sheet_chords)]}]}]}
    return ResumoHarmonicoResponse.model_validate(data)


def test_normalize_response_reports_adapted_chords():
    result = normalize_response(_response(["A7(9)", "E7(4)", "D"]), "pesquisa")
    assert result.harmonicSummary.blocos[0].acordes == ["A9", "Esus4", "D"]
    assert any("A7(9) → A9" in note and "E7(4) → Esus4" in note for note in result.observacoes)


def test_ensure_client_chords_fixes_cached_catalog_songs():
    cached = _response(["A7(9)", "Lá", "D"], sheet_chords=["E7(4)", "Sol"])
    fixed = ensure_client_chords(cached)
    assert fixed.harmonicSummary.blocos[0].acordes == ["A9", "D"]
    assert [item.acorde for item in fixed.fullChordSheet.sections[0].linhas[0].acordes] == ["Esus4"]
    assert any("Lá" in note and "Sol" in note for note in fixed.observacoes)
    assert all(is_client_chord(chord) for chord in fixed.harmonicSummary.blocos[0].acordes)
