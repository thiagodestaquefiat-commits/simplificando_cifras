"""Monta o resumo harmônico direto do texto de uma cifra, sem IA.

Usado quando a cifra veio pronta da web (Cifra Club): a estrutura já está no texto
(seções entre colchetes, linha de acordes acima da linha de letra), então não é preciso
pagar o DeepSeek para reorganizá-la.
"""
from __future__ import annotations

import re

from ..schemas.resumo_harmonico import ResumoHarmonicoResponse
from .harmonic_normalizer import is_section_name, normalize_chord, split_chord_token

_SECTION_RE = re.compile(r"^\s*\[([^\]]{1,60})\]\s*(.*)$")
_TAB_LINE_RE = re.compile(r"^\s*[A-Ga-g][#b]?\s*\|")
_REPEAT_RE = re.compile(r"^\(?\s*\d{1,2}\s*[xX]\s*\)?$")
# Cifra Club rotula os trechos de tablatura assim ("Parte 1 de 3"): é riff, não letra nem parte da música.
_TAB_PART_RE = re.compile(r"^\s*parte\s+\d+\s+de\s+\d+\s*:?\s*$", re.IGNORECASE)
_ROOT_RE = re.compile(r"^([A-G])([#b]?)(m(?!aj))?")
_SHARP_OF = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
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
    stanza = 0  # estrofes (separadas por linha em branco) viram blocos próprios no resumo
    in_tab_part = False  # dentro de um "Parte 1 de 3" (riff em tablatura) até a próxima linha em branco

    def flush_pending():
        nonlocal pending_chords
        if pending_chords and not current["tab"]:
            offset = min(position for _, position in pending_chords)
            current["linhas"].append({"letra": "", "acordes": [(chord, position - offset) for chord, position in pending_chords],
                                      "estrofe": stanza})
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
            in_tab_part = False
            start_section(header.group(1).strip())
            line = " " * (len(line) - len(header.group(2))) + header.group(2) if header.group(2).strip() else ""
        elif is_section_name(line):
            # Cifra Club também escreve as partes como texto: "Primeira Parte:", "Refrão:".
            start_section(line.strip().rstrip(":").strip())
            continue
        if not line.strip():
            flush_pending()
            stanza += 1
            in_tab_part = False
            continue
        if _TAB_PART_RE.match(line):
            flush_pending()
            in_tab_part = True
            continue
        if current["tab"] or in_tab_part or _TAB_LINE_RE.match(line):
            continue
        chords = _chords_in_line(line)
        if chords:
            flush_pending()
            pending_chords = chords
            continue
        current["linhas"].append({"letra": line.strip(), "acordes": _shift(pending_chords, line), "estrofe": stanza})
        pending_chords = None
    start_section(None)

    sections = [section for section in sections if not section["tab"] and section["linhas"]][:_MAX_SECTIONS]
    blocos = _summary_blocks(_stanzas(sections))
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


def _stanzas(sections: list[dict]) -> list[tuple[int, str | None, str | None, list[str]]]:
    """(índice da seção, seção, primeira letra, acordes) de cada estrofe com acordes.

    Linhas de letra sem acorde que vêm antes (ex.: "A minha alma tá armada..." seguida de linha em
    branco) entram na estrofe seguinte e viram a frase-guia dela.
    """
    result = []
    for section_index, section in enumerate(sections):
        carry: list[str] = []
        groups: dict[int, list[dict]] = {}
        for line in section["linhas"]:
            groups.setdefault(line.get("estrofe", 0), []).append(line)
        for lines in groups.values():
            chords = [chord for line in lines for chord, _ in line["acordes"]]
            lyrics = [line["letra"] for line in lines if line["letra"]]
            if not chords:
                carry.extend(lyrics)
                continue
            lyric = next(iter(carry + lyrics), None)
            carry = []
            result.append((section_index, section["nome"], lyric, chords))
    return result


def _dedupe(chords: list[str]) -> list[str]:
    return [chord for index, chord in enumerate(chords) if index == 0 or chord != chords[index - 1]]


def _simple(chord: str) -> str:
    """Forma simples do acorde para comparar voltas: F9 = F7M = F, Am7 = Am, C/E = C, Db = C#."""
    match = _ROOT_RE.match(chord or "")
    if not match:
        return chord
    root = match.group(1) + match.group(2)
    return _SHARP_OF.get(root, root) + ("m" if match.group(3) else "")


def _same(a: list[str], b: list[str]) -> bool:
    return len(a) == len(b) and all(_simple(x) == _simple(y) for x, y in zip(a, b))


def _loop(sequence: list[str]) -> tuple[list[str], int] | None:
    """Menor volta que explica a sequência inteira e quantas voltas ela dá (meia volta arredonda pra cima).

    A B C#m B A B -> (A B C#m B, 2): o fim pode ser uma volta incompleta, desde que haja pelo menos
    uma volta e meia — senão é só uma progressão que termina parecida com o começo.
    """
    size = len(sequence)
    for period in range(1, size):
        if period * 3 > size * 2:
            break
        if all(_simple(sequence[index]) == _simple(sequence[index % period]) for index in range(size)):
            return sequence[:period], (size + period // 2) // period
    return None


def _phrase_key(phrase: str | None) -> str | None:
    return phrase.casefold() if phrase else None


def _summary_blocks(stanzas: list[tuple[int, str | None, str | None, list[str]]]) -> list[dict]:
    """Junta as estrofes em blocos do resumo ROUDY: frase-guia + uma volta + quantas voltas.

    - estrofes seguidas da mesma seção que continuam a mesma volta viram um bloco só, mesmo quando a
      cifra quebra a parte com linha em branco (ou quebra de página do PDF);
    - a seção seguinte também entra no bloco quando continua exatamente a mesma volta
      (Pré-Refrão 1 + Pré-Refrão 2 com A B C#m B);
    - uma seção que repete uma parte já resumida (Segunda Parte, refrão de novo) não entra outra vez,
      e não soma voltas no bloco anterior;
    - trecho instrumental com uma volta que já está no resumo não vira bloco novo.
    """
    blocks: list[dict] = []
    seen: set[str] = set()
    current: dict | None = None
    skipping = False
    previous_section = None

    def close():
        nonlocal current
        if current is None:
            return
        seen.update(current["phrases"])
        loop = _loop(current["sequence"])
        if loop:
            chords, turns = loop
        else:
            chords, turns = _condense(current["sequence"])[0], 1
        blocks.append({"acordes": chords[:_MAX_CHORDS], "repeticoes": turns if turns > 1 else None,
                       "fraseGuia": current["phrase"], "secao": current["section"]})
        current = None

    def cycle_of(sequence):
        loop = _loop(sequence)
        return loop[0] if loop else sequence

    for section_index, name, lyric, chords in stanzas:
        phrase = _guide_phrase(lyric)
        key = _phrase_key(phrase)
        sequence = _dedupe(chords)
        new_section = section_index != previous_section
        previous_section = section_index
        known = bool(key) and (key in seen or (current is not None and key in current["phrases"]))
        if new_section:
            skipping = known
        elif key and key in seen:
            skipping = True
        if skipping:
            if key and not known:
                skipping = False
            else:
                close()
                continue
        known_loops = [block["acordes"] for block in blocks]
        if current is not None:
            known_loops.append(cycle_of(current["sequence"]))
        if key is None and any(_same(cycle_of(sequence), loop) for loop in known_loops):
            close()
            continue
        if current is not None:
            combined = _dedupe(current["sequence"] + sequence)
            loop = _loop(combined)
            if new_section:
                # Mesma volta continuando na seção seguinte vira um bloco só: Pré-Refrão 1 + 2,
                # ou a Intro instrumental que já é a volta da primeira parte.
                fits = (loop is not None and key is not None
                        and _same(loop[0], cycle_of(current["sequence"]))
                        and (current["phrase"] is not None or _same(cycle_of(sequence), loop[0])))
            else:
                fits = loop is not None
            if fits:
                current["sequence"] = combined
                if key:
                    current["phrases"].add(key)
                    current["phrase"] = current["phrase"] or phrase
                continue
            close()
        current = {"sequence": sequence, "phrase": phrase, "section": name, "phrases": {key} if key else set()}
    close()
    return blocks


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
