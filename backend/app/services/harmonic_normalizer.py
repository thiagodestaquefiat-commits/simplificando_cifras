from __future__ import annotations

import re

from ..errors import ApiError
from ..schemas.resumo_harmonico import ResumoHarmonicoResponse


FLAT_ROOTS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
CHORD_RE = re.compile(
    r"^(?P<root>[A-Ga-g](?:#|b)?)(?P<quality>[^/\s]{0,20})?(?:/(?P<bass>[A-Ga-g](?:#|b)?))?$"
)


def _shown_root(value: str) -> str:
    return value[0].upper() + value[1:]


def _canonical_root(value: str) -> str:
    normalized = value[0].upper() + value[1:]
    return FLAT_ROOTS.get(normalized, normalized)


def _parse_chord(value: str) -> tuple[str, str]:
    compact = (
        str(value or "")
        .strip()
        .replace("♯", "#")
        .replace("♭", "b")
        .replace(" ", "")
        .rstrip(".")
    )
    match = CHORD_RE.fullmatch(compact)
    if not match:
        raise ValueError(f"Acorde inválido: {value}")

    quality = match.group("quality") or ""
    aliases = {
        "4": "sus4",
        "2": "sus2",
        "7M": "maj7",
        "M7": "maj7",
        "m7M": "mMaj7",
    }
    quality = aliases.get(quality, quality)
    shown_bass = f"/{_shown_root(match.group('bass'))}" if match.group("bass") else ""
    canonical_bass = f"/{_canonical_root(match.group('bass'))}" if match.group("bass") else ""
    display_name = f"{_shown_root(match.group('root'))}{quality}{shown_bass}"
    canonical_name = f"{_canonical_root(match.group('root'))}{quality}{canonical_bass}"
    return display_name, canonical_name


def normalize_chord(value: str) -> str:
    """Valida e normaliza aliases sem substituir a grafia válida do usuário."""
    return _parse_chord(value)[0]


def canonicalize_chord(value: str) -> str:
    """Retorna a forma interna em sustenidos para busca e comparação."""
    return _parse_chord(value)[1]


def normalize_response(result: ResumoHarmonicoResponse, source_type: str) -> ResumoHarmonicoResponse:
    normalized = result.model_copy(deep=True)
    invalid = []

    if normalized.tom:
        try:
            normalized.tom = normalize_chord(normalized.tom)
        except ValueError:
            normalized.observacoes.append(f"Tom não validado: {normalized.tom}")
            normalized.tom = None

    for trecho in normalized.trechos:
        chords = []
        for chord in trecho.acordes:
            try:
                chords.append(normalize_chord(chord))
            except ValueError:
                invalid.append(chord)
        trecho.acordes = chords

    if invalid:
        normalized.observacoes.append(
            "Acordes não reconhecidos foram omitidos: " + ", ".join(sorted(set(invalid)))
        )

    normalized.trechos = [item for item in normalized.trechos if item.acordes]
    if not normalized.trechos:
        raise ApiError(
            "resultado_nao_confiavel",
            "Não foi possível produzir um resumo harmônico confiável.",
            422,
        )

    if source_type == "pesquisa":
        if normalized.confianca == "alta":
            normalized.confianca = "media"
        warning = (
            "Resultado gerado por IA sem fonte enviada pelo usuário; "
            "acordes, tom e repetições podem precisar de correção."
        )
        if warning not in normalized.observacoes:
            normalized.observacoes.append(warning)

    normalized.observacoes = list(dict.fromkeys(normalized.observacoes))[:20]
    return normalized
