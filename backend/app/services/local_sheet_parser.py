"""Monta o resumo harmônico direto do texto de uma cifra, sem IA.

Usado quando a cifra veio pronta da web (Cifra Club): a estrutura já está no texto
(seções entre colchetes, linha de acordes acima da linha de letra), então não é preciso
pagar o DeepSeek para reorganizá-la.
"""
from __future__ import annotations

import re

from ..schemas.resumo_harmonico import ResumoHarmonicoResponse
from .harmonic_normalizer import normalize_chord, split_chord_token

_SECTION_RE = re.compile(r"^\s*\[([^\]]{1,60})\]\s*(.*)$")
_TAB_LINE_RE = re.compile(r"^\s*[A-Ga-g][#b]?\s*\|")
_REPEAT_RE = re.compile(r"^\(?\s*\d{1,2}\s*[xX]\s*\)?$")
_MAX_BLOCOS = 40
_MAX_SECTIONS = 80
_MAX_CHORDS = 64


def _chords_in_line(line: str) -> list[tuple[str, int]] | None:
    """Acordes e posições se a linha for só de acordes; None se tiver letra."""
    found = []
    for match in re.finditer(r"\S+", line):
        token = match.group(0)
        candidate = token.strip("|")
        if not candidate or _REPEAT_RE.fullmatch(candidate) or candidate in {"-", "/", "%"}:
            continue
        if candidate.startswith("(") and candidate.endswith(")") and len(candidate) > 2:
            candidate = candidate[1:-1]
        try:
            chords = split_chord_token(candidate)
        except ValueError:
            return None
        position = match.start()
        for chord in chords:
            found.append((chord, position))
            position += len(chord) + 1
    return found or None


def parse_chord_sheet(text: str, titulo: str | None, artista: str | None,
                      key: str | None = None) -> ResumoHarmonicoResponse | None:
    sections: list[dict] = []
    current = {"nome": None, "linhas": [], "tab": False}
    pending_chords: list[tuple[str, int]] | None = None

    def flush_pending():
        nonlocal pending_chords
        if pending_chords and not current["tab"]:
            offset = min(position for _, position in pending_chords)
            current["linhas"].append({"letra": "", "acordes": [(chord, position - offset) for chord, position in pending_chords]})
        pending_chords = None

    def start_section(name: str | None):
        nonlocal current
        flush_pending()
        if current["linhas"]:
            sections.append(current)
        current = {"nome": name, "linhas": [], "tab": bool(name and name.lower().startswith("tab"))}

    for raw_line in (text or "").splitlines():
        line = raw_line.rstrip()
        header = _SECTION_RE.match(line)
        if header:
            start_section(header.group(1).strip())
            line = " " * (len(line) - len(header.group(2))) + header.group(2) if header.group(2).strip() else ""
        if not line.strip():
            flush_pending()
            continue
        if current["tab"] or _TAB_LINE_RE.match(line):
            continue
        chords = _chords_in_line(line)
        if chords:
            flush_pending()
            pending_chords = chords
            continue
        current["linhas"].append({"letra": line.strip(), "acordes": _shift(pending_chords, line)})
        pending_chords = None
    start_section(None)

    sections = [section for section in sections if not section["tab"] and section["linhas"]][:_MAX_SECTIONS]
    blocos = []
    seen = set()
    for section in sections:
        chords = [chord for line in section["linhas"] for chord, _ in line["acordes"]]
        if not chords:
            continue
        lyric = next((line["letra"] for line in section["linhas"] if line["letra"]), None)
        progression, repetitions = _condense(chords)
        # Padrão ROUDY: seção + frase-guia curta + progressão de uma volta; cada seção uma vez.
        identity = ((section["nome"] or "").casefold(), tuple(progression))
        if identity in seen:
            continue
        seen.add(identity)
        blocos.append({"acordes": progression[:_MAX_CHORDS],
                       "repeticoes": repetitions if lyric is None else None,
                       "fraseGuia": _guide_phrase(lyric), "secao": section["nome"]})
    if not blocos:
        return None
    first_chord = blocos[0]["acordes"][0]
    return ResumoHarmonicoResponse.model_validate({
        "titulo": (titulo or "Música")[:160],
        "artista": (artista or None),
        "tom": key or first_chord,
        "capotraste": None,
        "confianca": "alta",
        "observacoes": [],
        "harmonicSummary": {"blocos": blocos[:_MAX_BLOCOS]},
        "fullChordSheet": {
            "source": "web_source",
            "content": text,
            "sections": [{
                "nome": section["nome"],
                "linhas": [{"letra": line["letra"][:2000],
                            "acordes": [{"acorde": chord, "posicao": min(position, 500)}
                                        for chord, position in line["acordes"][:_MAX_CHORDS]]}
                           for line in section["linhas"][:200]],
            } for section in sections],
        },
    })


_MAX_PROGRESSION = 8


def _condense(chords: list[str]) -> tuple[list[str], int | None]:
    """Reduz a sequência da seção a uma volta da progressão (padrão dos resumos do ROUDY).

    - junta acordes iguais seguidos (C C G -> C G);
    - se a sequência é um ciclo (C G4 Am C G4 Am ...), fica só o ciclo, com a contagem de voltas;
    - sem ciclo e longa demais, fica a ordem em que cada acorde aparece pela primeira vez.
    """
    sequence = [chord for index, chord in enumerate(chords) if index == 0 or chord != chords[index - 1]]
    for period in range(1, len(sequence) // 2 + 1):
        if all(sequence[index] == sequence[index % period] for index in range(len(sequence))):
            cycle = sequence[:period]
            turns = len(sequence) // period if len(sequence) % period == 0 else None
            return cycle, turns if turns and turns > 1 else None
    if len(sequence) > _MAX_PROGRESSION:
        return list(dict.fromkeys(sequence)), None
    return sequence, None


def _guide_phrase(lyric: str | None) -> str | None:
    """Frase-guia curta copiada literalmente do início da letra.

    Linha inteira quando tem até 6 palavras ("O céu começa a se abrir"); senão, as 4 primeiras.
    Para no primeiro espaço duplo, porque a frase precisa existir igual no texto da cifra.
    """
    if not lyric:
        return None
    words = []
    for match in re.finditer(r"(\S+)(\s*)", lyric.strip()):
        words.append(match.group(1))
        if match.group(2) not in ("", " "):
            break
    if len(words) > 6:
        words = words[:4]
    return " ".join(words) or None


def _shift(chords: list[tuple[str, int]] | None, lyric_line: str) -> list[tuple[str, int]]:
    """Ajusta as posições dos acordes ao recuo removido da linha de letra."""
    if not chords:
        return []
    indent = len(lyric_line) - len(lyric_line.lstrip())
    return [(chord, max(0, position - indent)) for chord, position in chords]


__all__ = ["parse_chord_sheet", "normalize_chord"]
