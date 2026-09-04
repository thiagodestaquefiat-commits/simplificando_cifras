from __future__ import annotations

import re
import unicodedata

from ..errors import ApiError
from ..schemas.resumo_harmonico import ResumoHarmonicoResponse


FLAT_ROOTS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
CHORD_RE = re.compile(
    r"^(?P<root>[A-Ga-g](?:#|b)?)(?P<quality>[^/\s]{0,20})?(?:/(?P<bass>[A-Ga-g](?:#|b)?))?$"
)
QUALITY_RE = re.compile(
    r"^(?:|m|5|6|7|9|11|13|2|4|sus|sus2|sus4|add9|maj7|M7|7M|7m|7\+|Δ7|"
    r"m7|m9|m11|m13|m6|dim|°|o|aug|\+|#5|m7b5|ø|mMaj7|m7\(11\)|m\(add9\)|"
    r"7\([#b]?\d+\)|maj7\(\d+\)|m7\([#b]?\d+\)|\(#5\)|\(add9\))$"
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
    # Uma segunda nota maiúscula fora do baixo indica acordes concatenados.
    if re.search(r"[A-G]", quality):
        raise ValueError(f"Acordes concatenados: {value}")
    if not QUALITY_RE.fullmatch(quality):
        raise ValueError(f"Qualidade de acorde inválida: {value}")
    display_aliases = {
        "4": "sus4",
        "7M": "maj7",
        "M7": "maj7",
        "m7M": "mMaj7",
    }
    canonical_aliases = {**display_aliases, "2": "sus2"}
    display_quality = display_aliases.get(quality, quality)
    canonical_quality = canonical_aliases.get(quality, quality)
    shown_bass = f"/{_shown_root(match.group('bass'))}" if match.group("bass") else ""
    canonical_bass = f"/{_canonical_root(match.group('bass'))}" if match.group("bass") else ""
    display_name = f"{_shown_root(match.group('root'))}{display_quality}{shown_bass}"
    canonical_name = f"{_canonical_root(match.group('root'))}{canonical_quality}{canonical_bass}"
    return display_name, canonical_name


def split_chord_token(value: str) -> list[str]:
    """Separa somente raízes maiúsculas concatenadas; preserva inversões como E/G#."""
    compact = str(value or "").strip().replace("♯", "#").replace("♭", "b").replace(" ", "").rstrip(".")
    starts = [match.start() for match in re.finditer(r"(?<!/)[A-G](?:#|b)?", compact)]
    if len(starts) <= 1:
        return [normalize_chord(compact)]
    starts.append(len(compact))
    chunks = [compact[starts[index]:starts[index + 1]] for index in range(len(starts) - 1)]
    return [normalize_chord(chunk) for chunk in chunks]


def normalize_chord(value: str) -> str:
    """Valida e normaliza aliases sem substituir a grafia válida do usuário."""
    return _parse_chord(value)[0]


def canonicalize_chord(value: str) -> str:
    """Retorna a forma interna em sustenidos para busca e comparação."""
    return _parse_chord(value)[1]


def _compress_exact_repetition(chords: list[str]) -> tuple[list[str], int | None]:
    """Comprime apenas quando o trecho inteiro é a repetição exata de um padrão."""
    total = len(chords)
    for unit_size in range(2, (total // 2) + 1):
        if total % unit_size:
            continue
        repetitions = total // unit_size
        unit = chords[:unit_size]
        if repetitions <= 99 and unit * repetitions == chords:
            return unit, repetitions
    return chords, None


def _fold(value: str | None) -> str:
    return " ".join(unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii").casefold().split())


SECTION_NAMES = {
    "intro": "Intro", "introducao": "Intro",
    "verso": "Verso", "pre refrao": "Pré-Refrão", "pre-refrao": "Pré-Refrão",
    "refrao": "Refrão", "ponte": "Ponte", "interludio": "Interlúdio",
    "solo": "Solo", "final": "Final", "outro": "Final",
}


def normalize_section_name(value: str | None) -> str | None:
    raw = str(value or "").strip().strip("[]()")
    folded = _fold(raw)
    if not folded or re.fullmatch(r"(?:trecho|secao)\s*\d+", folded):
        return None
    for key, label in SECTION_NAMES.items():
        match = re.fullmatch(rf"{re.escape(key)}(?:\s+(\d+))?", folded)
        if match:
            return f"{label} {match.group(1)}" if match.group(1) else label
    return None


def _source_lyrics_by_section(sheet) -> list[tuple[str | None, str]]:
    if not sheet:
        return []
    return [
        (normalize_section_name(section.nome), " ".join(line.letra for line in section.linhas if line.letra))
        for section in sheet.sections
    ]


def _guide_belongs_to_source(guide: str | None, section_name: str | None, sheet, source_text: str | None) -> bool:
    folded_guide = _fold(guide)
    if not folded_guide:
        return True
    candidates = _source_lyrics_by_section(sheet)
    if section_name:
        same_section = [lyrics for name, lyrics in candidates if name == section_name]
        if same_section:
            return any(folded_guide in _fold(lyrics) for lyrics in same_section)
    if candidates:
        return any(folded_guide in _fold(lyrics) for _, lyrics in candidates)
    return bool(source_text and folded_guide in _fold(source_text))


def _normalize_chord_items(values) -> tuple[list, list[str]]:
    normalized_items = []
    invalid = []
    for item in values:
        try:
            separated = split_chord_token(item.acorde)
        except ValueError:
            invalid.append(item.acorde)
            continue
        position = item.posicao
        for chord in separated:
            clone = item.model_copy(deep=True)
            clone.acorde = chord
            clone.posicao = min(500, position)
            normalized_items.append(clone)
            position += len(chord) + 1
    return normalized_items, invalid


def render_full_chord_sheet(sheet) -> str:
    """Reconstrói texto visual uma vez, a partir da associação acorde/letra."""
    rows = []
    for section in sheet.sections:
        if section.nome:
            rows.append(f"[{section.nome}]")
        for line in section.linhas:
            output = ""
            for item in sorted(line.acordes, key=lambda chord: chord.posicao):
                position = max(len(output), item.posicao)
                output += " " * (position - len(output)) + item.acorde
            if output:
                rows.append(output.rstrip())
            if line.letra:
                rows.append(line.letra)
        if rows and rows[-1] != "":
            rows.append("")
    return "\n".join(rows).strip()


def _sheet_chords(sheet) -> list[str]:
    if not sheet:
        return []
    return [
        item.acorde
        for section in sheet.sections
        for line in section.linhas
        for item in sorted(line.acordes, key=lambda chord: chord.posicao)
    ]


def _text_chords(source_text: str | None) -> list[str]:
    chords = []
    for token in re.findall(r"\S+", source_text or ""):
        candidate = token.strip("[](){},;:|")
        try:
            chords.extend(split_chord_token(candidate))
        except ValueError:
            continue
    return chords


def _canonical_sequence(values: list[str]) -> list[str]:
    return [canonicalize_chord(value) for value in values]


def _line_records(sheet) -> list[dict]:
    records = []
    if not sheet:
        return records
    for section_index, section in enumerate(sheet.sections):
        section_name = normalize_section_name(section.nome)
        for line_index, line in enumerate(section.linhas):
            records.append({
                "section_index": section_index,
                "section_name": section_name,
                "line_index": line_index,
                "lyrics": _fold(line.letra),
                "chords": _canonical_sequence([item.acorde for item in sorted(line.acordes, key=lambda chord: chord.posicao)]),
            })
    return records


def _section_stream(records: list[dict], start_index: int) -> tuple[list[str], list[int]]:
    if start_index >= len(records):
        return [], []
    section_index = records[start_index]["section_index"]
    chords, owners = [], []
    for record_index in range(start_index, len(records)):
        record = records[record_index]
        if record["section_index"] != section_index:
            break
        chords.extend(record["chords"])
        owners.extend([record_index] * len(record["chords"]))
    return chords, owners


def _local_repeat_evidence(records: list[dict], trecho, cursor: int) -> tuple[int, int | None]:
    """Relaciona o bloco ao próximo ponto da cifra e conta apenas sequências consecutivas ali."""
    wanted = _canonical_sequence(trecho.acordes)
    guide = _fold(trecho.fraseGuia)
    section_name = normalize_section_name(trecho.secao)
    for record_index in range(cursor, len(records)):
        record = records[record_index]
        if guide and guide not in record["lyrics"]:
            continue
        if section_name and record["section_name"] != section_name:
            continue
        stream, owners = _section_stream(records, record_index)
        if stream[:len(wanted)] != wanted:
            continue
        repetitions = 0
        offset = 0
        while stream[offset:offset + len(wanted)] == wanted:
            repetitions += 1
            offset += len(wanted)
        consumed = len(wanted) * max(1, repetitions)
        end_record = owners[min(consumed, len(owners)) - 1] if owners else record_index
        return repetitions, end_record + 1
    return 0, None


def _local_explicit_repeat(source_text: str | None, trecho, repetitions: int) -> bool:
    """Aceita marcação Nx somente no mesmo parágrafo da progressão/frase correspondente."""
    if not source_text:
        return False
    wanted = _canonical_sequence(trecho.acordes)
    guide = _fold(trecho.fraseGuia)
    section_name = _fold(normalize_section_name(trecho.secao))
    marker = re.compile(rf"\(\s*{repetitions}\s*x\s*\)", re.IGNORECASE)
    for paragraph in re.split(r"\n\s*\n", source_text):
        if not marker.search(paragraph):
            continue
        folded = _fold(paragraph)
        if guide and guide not in folded:
            continue
        if not guide and section_name and section_name not in folded:
            continue
        available = _canonical_sequence(_text_chords(paragraph))
        if any(available[index:index + len(wanted)] == wanted for index in range(len(available) - len(wanted) + 1)):
            return True
    return False


_DIAGRAM_TEXT_RE = re.compile(r"^\s*(?:(?:\d+|[xX]|[-|]{2,})\s*){2,}$")


def _clean_trailing_diagram_sections(sheet) -> None:
    """Remove cauda técnica somente com legenda extensa + linha numérica de diagrama."""
    if not sheet:
        return
    flat = [
        (section_index, line_index, line)
        for section_index, section in enumerate(sheet.sections)
        for line_index, line in enumerate(section.linhas)
    ]
    if not flat:
        return
    technical_positions = [
        index for index, (_, _, line) in enumerate(flat[-16:], start=max(0, len(flat) - 16))
        if _DIAGRAM_TEXT_RE.fullmatch(line.letra or "")
    ]
    if not technical_positions:
        return
    technical_index = technical_positions[-1]
    candidate = None
    for index in range(technical_index - 1, max(-1, technical_index - 6), -1):
        line = flat[index][2]
        if not line.letra.strip() and len(line.acordes) >= 5:
            candidate = index
            break
    if candidate is None:
        return
    tail = flat[candidate:]
    if any(line.letra.strip() and not _DIAGRAM_TEXT_RE.fullmatch(line.letra) for _, _, line in tail):
        return
    section_index, line_index, _ = flat[candidate]
    sheet.sections[section_index].linhas = sheet.sections[section_index].linhas[:line_index]
    sheet.sections = [
        section for index, section in enumerate(sheet.sections)
        if index < section_index or section.linhas
    ]


def normalize_response(result: ResumoHarmonicoResponse, source_type: str, source_text: str | None = None) -> ResumoHarmonicoResponse:
    normalized = result.model_copy(deep=True)
    invalid = []
    derived_repetitions = set()

    if normalized.tom:
        try:
            normalized.tom = normalize_chord(normalized.tom)
        except ValueError:
            normalized.observacoes.append(f"Tom não validado: {normalized.tom}")
            normalized.tom = None

    for trecho in normalized.harmonicSummary.blocos:
        chords = []
        for chord in trecho.acordes:
            try:
                chords.extend(split_chord_token(chord))
            except ValueError:
                invalid.append(chord)
        trecho.acordes = chords
        trecho.secao = normalize_section_name(trecho.secao)
        if trecho.repeticoes is None:
            trecho.acordes, trecho.repeticoes = _compress_exact_repetition(trecho.acordes)
            if trecho.repeticoes:
                derived_repetitions.add(id(trecho))

    normalized.harmonicSummary.blocos = [item for item in normalized.harmonicSummary.blocos if item.acordes]
    if not normalized.harmonicSummary.blocos:
        raise ApiError(
            "resultado_nao_confiavel",
            "Não foi possível produzir um resumo harmônico confiável.",
            422,
        )

    if normalized.fullChordSheet:
        for section in normalized.fullChordSheet.sections:
            for line in section.linhas:
                line.acordes, line_invalid = _normalize_chord_items(line.acordes)
                invalid.extend(line_invalid)
        _clean_trailing_diagram_sections(normalized.fullChordSheet)

    source_chords = _sheet_chords(normalized.fullChordSheet) + _text_chords(source_text)
    if source_chords:
        source_vocabulary = {canonicalize_chord(chord) for chord in source_chords}
        for trecho in normalized.harmonicSummary.blocos:
            trecho.acordes = [chord for chord in trecho.acordes if canonicalize_chord(chord) in source_vocabulary]
        normalized.harmonicSummary.blocos = [item for item in normalized.harmonicSummary.blocos if item.acordes]
        if not normalized.harmonicSummary.blocos:
            raise ApiError("resultado_nao_confiavel", "Os acordes do resumo não pertencem à fonte.", 422)
    records = _line_records(normalized.fullChordSheet)
    local_cursor = 0
    for trecho in normalized.harmonicSummary.blocos:
        local_repetitions, next_cursor = _local_repeat_evidence(records, trecho, local_cursor)
        if trecho.repeticoes == 1:
            trecho.repeticoes = None
        elif trecho.repeticoes and id(trecho) not in derived_repetitions:
            locally_proven = local_repetitions == trecho.repeticoes
            explicitly_proven = _local_explicit_repeat(source_text, trecho, trecho.repeticoes)
            if not (locally_proven or explicitly_proven):
                trecho.repeticoes = None
        if next_cursor is not None:
            local_cursor = next_cursor

    for trecho in normalized.harmonicSummary.blocos:
        if not _guide_belongs_to_source(trecho.fraseGuia, trecho.secao, normalized.fullChordSheet, source_text):
            trecho.fraseGuia = None

    # O resumo é móvel e conciso: remove apenas duplicatas semanticamente idênticas.
    unique_blocks = []
    seen = set()
    for trecho in normalized.harmonicSummary.blocos:
        identity = (tuple(trecho.acordes), trecho.repeticoes, _fold(trecho.fraseGuia), trecho.secao)
        if identity not in seen:
            unique_blocks.append(trecho)
            seen.add(identity)
    normalized.harmonicSummary.blocos = unique_blocks[:12]

    if invalid:
        normalized.observacoes.append(
            "Acordes não reconhecidos foram omitidos: " + ", ".join(sorted(set(invalid)))
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
