from __future__ import annotations

import re
import unicodedata

from ..errors import ApiError
from ..schemas.resumo_harmonico import LinhaCifraCompleta, ResumoHarmonicoResponse, SecaoCifraCompleta
from .content_extractor import clean_musical_text, is_technical_line, TECHNICAL_BLOCK_RE, TECHNICAL_LABEL_RE


FLAT_ROOTS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
CHORD_RE = re.compile(
    r"^(?P<root>[A-Ga-g](?:#|b)?)(?P<quality>(?:\([^()\s]{1,12}\)|[^/\s(]){0,20})(?:/(?P<bass>[A-Ga-g](?:#|b)?))?$"
)


# Espelho de normalizeSuffix() em js/instruments/multi-instrument-chord-library.js.
# O backend aceita exatamente o que o frontend aceita e PRESERVA a grafia original do acorde
# (A7(9) continua A7(9)); o frontend só usa o equivalente para escolher o diagrama.
CLIENT_ALIASES = {
    "": "", "maj": "", "maior": "",
    "m": "m", "min": "m", "menor": "m", "-": "m",
    "5": "5", "6": "6", "m6": "m6", "7": "7", "dom": "7",
    "maj7": "maj7", "M7": "maj7", "7M": "maj7", "7m": "maj7", "7+": "maj7", "Δ7": "maj7",
    "m7": "m7", "min7": "m7", "mMaj7": "mMaj7", "m(maj7)": "mMaj7",
    "9": "9", "maj9": "maj9", "M9": "maj9", "m9": "m9", "add9": "add9", "(add9)": "add9",
    "11": "11", "m11": "m11", "m7(11)": "m11", "13": "13",
    "2": "sus2", "sus2": "sus2", "4": "sus4", "sus": "sus4", "sus4": "sus4",
    "dim": "dim", "°": "dim", "o": "dim",
    "m7(b5)": "m7b5", "m7b5": "m7b5", "ø": "m7b5",
    "aug": "aug", "+": "aug", "#5": "aug", "(#5)": "aug",
}
CLIENT_EXTRA_ALIASES = {"m13": "m11", "m(7M)": "mMaj7", "m(maj7)": "mMaj7", "7sus4": "sus4",
                        "7sus": "sus4", "7(4)": "sus4", "m(add9)": "m", "m(9)": "m"}
_EXTENSION_RE = re.compile(r"^[#b+-]?\d{1,2}[#b+-]?(?:[/,][#b+-]?\d{1,2}[#b+-]?)*$")


def simplify_quality(quality: str) -> str:
    """Remove tudo que estiver entre parênteses: 7(9) -> 7, m(add9) -> m, m7(b5) -> m7."""
    return re.sub(r"\([^()]*\)", "", quality or "")


_PAREN_CHORD_TOKEN_RE = re.compile(r"(?<!\S)[A-G][#b]?[^\s/()]*\([^()\s]*\)[^\s/()]*(?:/[A-G][#b]?)?(?!\S)")


def simplify_chord_text(text: str | None) -> str | None:
    """Simplifica acordes com parênteses dentro de um texto de cifra, mantendo o alinhamento.

    Só troca tokens que são acordes válidos; letra e marcações como (2x) ficam intactas.
    """
    if not text:
        return text

    def replace(match: re.Match) -> str:
        token = match.group(0)
        try:
            simplified = normalize_chord(token)
        except ValueError:
            return token
        return simplified + " " * (len(token) - len(simplified))

    return "\n".join(_PAREN_CHORD_TOKEN_RE.sub(replace, line).rstrip() if "(" in line else line
                     for line in text.split("\n"))


def _client_base_alias(suffix: str) -> str | None:
    if suffix in CLIENT_ALIASES:
        return CLIENT_ALIASES[suffix]
    folded = suffix.casefold()
    return next((value for key, value in CLIENT_ALIASES.items() if key.casefold() == folded), None)


def client_suffix(suffix: str) -> str | None:
    """Sufixo canônico (para diagrama) ou None se o frontend rejeitaria o acorde."""
    suffix = (suffix or "").strip()
    base = _client_base_alias(suffix)
    if base is not None:
        return base
    if suffix in CLIENT_EXTRA_ALIASES:
        return CLIENT_EXTRA_ALIASES[suffix]
    match = re.fullmatch(r"(.*?)\(([^()]+)\)", suffix)
    if not match or not _EXTENSION_RE.fullmatch(match.group(2)):
        return None
    base = _client_base_alias(match.group(1))
    if base is None:
        return None
    tensions = re.split(r"[/,]", match.group(2))
    if base == "7":
        return next((value for key, value in (("4", "sus4"), ("13", "13"), ("11", "11"), ("9", "9")) if key in tensions), "7")
    if base == "maj7":
        return "maj9" if "9" in tensions else "maj7"
    if base == "m7":
        return "m11" if "11" in tensions else "m9" if "9" in tensions else "m7b5" if {"b5", "5-"} & set(tensions) else "m7"
    if base == "":
        return "add9" if "9" in tensions else "sus4" if "4" in tensions else ""
    return base


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
    if client_suffix(quality) is None:
        raise ValueError(f"Qualidade de acorde inválida: {value}")
    # Simplificação do ROUDY: extensões entre parênteses não são exibidas (A7(9) -> A7, E7(4) -> E7).
    quality = simplify_quality(quality)
    canonical_quality = client_suffix(quality)
    if canonical_quality is None:
        raise ValueError(f"Qualidade de acorde inválida: {value}")
    display_quality = quality
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


def is_client_chord(value: str) -> bool:
    """Replica parseChord do frontend para barrar acordes antes de responder."""
    compact = str(value or "").strip().replace("♯", "#").replace("♭", "b").replace(" ", "")
    match = re.fullmatch(r"([A-Ga-g][#b]?)(.*?)(?:/([A-Ga-g][#b]?))?", compact)
    return bool(match) and client_suffix(match.group(2)) is not None


def canonicalize_chord(value: str) -> str:
    """Retorna a forma interna em sustenidos para busca e comparação."""
    return _parse_chord(value)[1]


def condense_progression(chords: list[str], repetitions: int | None = None) -> tuple[list[str], int | None]:
    """Resumo no padrão ROUDY: uma volta da progressão + quantas vezes ela se repete.

    C D G C D G C D G C D G       -> C D G (4x)
    C D G C D G C D G C D G C D   -> C D G (4x)  (sobra incompleta no fim é a volta seguinte começando)
    Multiplica pela repetição que o bloco já tinha. Sequências sem padrão ficam como estão.
    """
    total = len(chords)
    for unit_size in range(1, total // 2 + 1):
        unit = chords[:unit_size]
        if len(set(unit)) < min(2, unit_size) and unit_size > 1:
            continue
        turns = total // unit_size
        if turns < 2 or any(chords[index] != unit[index % unit_size] for index in range(total)):
            continue
        if unit_size == 1 and total > 1:
            # Um acorde só repetido (C C C) não é progressão; mantém um.
            return unit, repetitions
        combined = turns * (repetitions or 1)
        return unit, combined if combined <= 99 else 99
    return chords, repetitions


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
    "primeira parte": "Primeira Parte", "segunda parte": "Segunda Parte",
    "terceira parte": "Terceira Parte", "quarta parte": "Quarta Parte",
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
    if source_text is not None:
        return guide in source_text
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
        candidate = token.strip("[]{},;:|")
        if candidate.startswith('(') and candidate.endswith(')'):
            candidate = candidate[1:-1]
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
    marker = re.compile(rf"(?<!\w)\(?\s*{repetitions}\s*x\s*\)?(?!\w)", re.IGNORECASE)
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
    if source_text is not None:
        source_text = clean_musical_text(source_text, (normalized.titulo, normalized.artista))
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
        fix_sheet_section_names(normalized.fullChordSheet)
        _clean_trailing_diagram_sections(normalized.fullChordSheet)
        normalized.fullChordSheet.sections = [section for section in normalized.fullChordSheet.sections
            if not TECHNICAL_LABEL_RE.fullmatch(section.nome or "")]
        for section in normalized.fullChordSheet.sections:
            kept, technical = [], False
            for line in section.linhas:
                if TECHNICAL_BLOCK_RE.fullmatch(line.letra):
                    technical = True
                    continue
                if is_technical_line(line.letra):
                    continue
                if technical and (not line.letra.strip() or _text_chords(line.letra) and
                                  len(_text_chords(line.letra)) == len(line.letra.split())):
                    continue
                if line.letra.strip():
                    technical = False
                kept.append(line)
            section.linhas = kept
            for line in section.linhas:
                line.acordes, line_invalid = _normalize_chord_items(line.acordes)
                invalid.extend(line_invalid)
        _clean_trailing_diagram_sections(normalized.fullChordSheet)

    source_chords = _text_chords(source_text) if source_text is not None else _sheet_chords(normalized.fullChordSheet)
    if source_text is not None or source_chords:
        source_vocabulary = set(source_chords)
        if normalized.fullChordSheet and source_text is not None:
            for section in normalized.fullChordSheet.sections:
                for line in section.linhas:
                    line.acordes = [item for item in line.acordes if item.acorde in source_vocabulary]
        for trecho in normalized.harmonicSummary.blocos:
            trecho.acordes = [chord for chord in trecho.acordes if chord in source_vocabulary]
        normalized.harmonicSummary.blocos = [item for item in normalized.harmonicSummary.blocos if item.acordes]
        if not normalized.harmonicSummary.blocos:
            raise ApiError("resultado_nao_confiavel", "Os acordes do resumo não pertencem à fonte.", 422)
    records = _line_records(normalized.fullChordSheet)
    local_cursor = 0
    for trecho in normalized.harmonicSummary.blocos:
        local_repetitions, next_cursor = _local_repeat_evidence(records, trecho, local_cursor)
        if trecho.repeticoes == 1:
            trecho.repeticoes = None
        elif trecho.repeticoes and (source_text is not None or id(trecho) not in derived_repetitions):
            locally_proven = source_text is None and local_repetitions == trecho.repeticoes
            explicitly_proven = _local_explicit_repeat(source_text, trecho, trecho.repeticoes)
            if source_text is not None:
                wanted = trecho.acordes * trecho.repeticoes
                for paragraph in re.split(r"\n\s*\n", source_text):
                    available = _text_chords(paragraph)
                    if (not trecho.fraseGuia or trecho.fraseGuia in paragraph) and any(
                        available[i:i + len(wanted)] == wanted for i in range(len(available) - len(wanted) + 1)
                    ):
                        locally_proven = True
            if not (locally_proven or explicitly_proven):
                trecho.repeticoes = None
        if next_cursor is not None:
            local_cursor = next_cursor

    for trecho in normalized.harmonicSummary.blocos:
        if trecho.fraseGuia:
            trecho.fraseGuia = re.split(r"\s+/\s+(?:Verso|Refrão|Seção|Trecho)\b", trecho.fraseGuia, flags=re.I)[0]
            if is_technical_line(trecho.fraseGuia):
                trecho.fraseGuia = None
        if not _guide_belongs_to_source(trecho.fraseGuia, trecho.secao, normalized.fullChordSheet, source_text):
            trecho.fraseGuia = None

    # O resumo é móvel e conciso: remove apenas duplicatas semanticamente idênticas.
    unique_blocks = []
    seen = set()
    for trecho in normalized.harmonicSummary.blocos:
        identity = (tuple(trecho.acordes), trecho.repeticoes, _fold(trecho.fraseGuia), None if trecho.fraseGuia else trecho.secao)
        if identity not in seen:
            unique_blocks.append(trecho)
            seen.add(identity)
    normalized.harmonicSummary.blocos = unique_blocks

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


# Mesmo vocabulário do isSectionName do app (js/editor/song-format.js): nome de seção não é frase-gancho.
_SECTION_NAME_RE = re.compile(
    r"^\(?\[?\s*(?:intro(?:du[çc][ãa]o)?|verso|estrofe|pr[ée][- ]?refr[ãa]o|p[óo]s[- ]?refr[ãa]o|refr[ãa]o|coro|ponte|"
    r"interl[úu]dio|instrumental|solo|final|outro|coda|vamp|parte|"
    r"(?:primeira|segunda|terceira|quarta|quinta)\s+parte|verse|pre[- ]?chorus|chorus|bridge|interlude|ending|tag|riff|tab)"
    r"(?:\s*\d+)?(?:\s+final)?(?:\s*\(?\s*\d+\s*x\s*\)?)?\s*\]?\)?:?$",
    re.IGNORECASE,
)
_SEGMENT_MIN_CHORDS = 9  # até 8 acordes cabe numa linha; acima disso vale quebrar em partes repetidas
_SEGMENT_MAX_UNIT = 8


def is_section_name(value) -> bool:
    return bool(_SECTION_NAME_RE.match(str(value or "").strip()))


_LOOP_MAX_UNIT_BLOCKS = 4
_LOOP_MAX_CHORDS = 16
_LOOP_SHORT_CHORDS = 4


def _block_signature(block) -> tuple:
    return tuple(block.acordes), block.repeticoes or 1


def _find_block_loop(blocks: list, start: int) -> tuple[int, int] | None:
    """(tamanho do padrão em blocos, voltas) do laço que começa em "start", ou None.

    Ex.: blocos C | Bm | C | Bm | C | Bm -> padrão de 2 blocos, 3 voltas. Escolhe o que cobre mais
    blocos; no empate, o padrão menor. Padrão de vários blocos só quando nenhum tem repetição própria.
    """
    signatures = [_block_signature(block) for block in blocks]
    best = None
    for size in range(1, _LOOP_MAX_UNIT_BLOCKS + 1):
        unit = signatures[start:start + size]
        if len(unit) < size:
            break
        if size > 1 and any(repeat != 1 for _chords, repeat in unit):
            continue
        if sum(len(chords) for chords, _repeat in unit) > _LOOP_MAX_CHORDS:
            continue
        # Laço curto (até 4 acordes, ex.: C | Bm em linhas separadas) junta mesmo com frases
        # diferentes. Estrofe inteira repetida com outra frase ("O céu começa..." e depois
        # "Santo, Santo, Santo") é outra parte da música: só junta se a frase também repetir.
        short = sum(len(chords) for chords, _repeat in unit) <= _LOOP_SHORT_CHORDS
        phrases = [_fold(block.fraseGuia) for block in blocks[start:start + size]]
        turns = 1
        while (signatures[start + turns * size:start + (turns + 1) * size] == unit and
               (short or [_fold(block.fraseGuia) for block in blocks[start + turns * size:start + (turns + 1) * size]] == phrases)):
            turns += 1
        covered = blocks[start:start + size * turns]
        # Intro só de acordes seguida da parte cantada com os mesmos acordes: ficam separadas,
        # senão a frase apareceria já na primeira volta (que é instrumental).
        if not covered[0].fraseGuia and any(block.fraseGuia for block in covered):
            continue
        if turns >= 2 and (best is None or size * turns > best[0] * best[1]):
            best = (size, turns)
    return best


def has_repeated_block_loop(blocks: list) -> bool:
    return any(_find_block_loop(blocks, index) for index in range(len(blocks)))


def merge_repeated_blocks(blocks: list) -> list:
    """Junta blocos seguidos que formam um laço numa linha só, no padrão ROUDY.

    "Tudo perde o valor" C / "Quando estou com você" Bm / C / Bm / C / Bm
    -> "Tudo perde o valor"  C Bm (3x). A frase-guia é a do primeiro bloco do laço.
    """
    merged, index = [], 0
    while index < len(blocks):
        loop = _find_block_loop(blocks, index)
        if not loop:
            merged.append(blocks[index])
            index += 1
            continue
        size, turns = loop
        unit = blocks[index:index + size]
        chords = [chord for block in unit for chord in block.acordes]
        chords = [chord for position, chord in enumerate(chords) if position == 0 or chord != chords[position - 1]]
        block = unit[0].model_copy(deep=True)
        block.acordes = chords
        block.repeticoes = min(turns * (unit[0].repeticoes or 1), 99)
        block.fraseGuia = next((item.fraseGuia for item in unit if item.fraseGuia), None)
        merged.append(block)
        index += size * turns
    return merged


def fix_sheet_section_names(sheet) -> None:
    """Deixa como título de seção só nome de seção de verdade (Intro, Refrão, Primeira Parte...).

    - Título que é letra ("Oceanos, onde os pés podem falhar") volta a ser a 1ª linha de letra da seção.
    - Linha de letra que é nome de seção ("Refrão:") sem acordes abre uma seção nova com esse nome.
    """
    if not sheet or not getattr(sheet, "sections", None):
        return
    fixed = []
    for section in sheet.sections:
        name = (section.nome or "").strip()
        lines = list(section.linhas)
        if name and not is_section_name(name):
            first = lines[0].letra.strip() if lines else ""
            if _fold(first) != _fold(name):
                lines.insert(0, LinhaCifraCompleta(letra=name))
            name = ""
        current = SecaoCifraCompleta(nome=name.strip("[]").strip().rstrip(":").strip() or None, linhas=[])
        for line in lines:
            if not line.acordes and line.letra.strip() and is_section_name(line.letra):
                if current.linhas or current.nome:
                    fixed.append(current)
                current = SecaoCifraCompleta(nome=line.letra.strip().strip("[]").strip().rstrip(":").strip(), linhas=[])
                continue
            current.linhas.append(line)
        fixed.append(current)
    sheet.sections = [section for section in fixed if section.linhas or section.nome][:80]


def segment_progression(chords: list[str]) -> list[tuple[list[str], int]]:
    """Quebra uma sequência longa em partes que se repetem em seguida (padrão ROUDY).

    Am F Dm Am F Dm Am F Dm Am Am7 G6/A Am Am7 G6/A  ->  [Am F Dm] 3x, [Am Am7 G6/A] 2x
    Em cada ponto escolhe o padrão que cobre mais acordes repetindo seguido; acordes soltos
    ficam juntos numa parte só, sem repetição.
    """
    parts: list[tuple[list[str], int]] = []
    loose: list[str] = []
    index, total = 0, len(chords)
    while index < total:
        best_unit, best_count = None, 1
        for size in range(1, min(_SEGMENT_MAX_UNIT, (total - index) // 2) + 1):
            unit = chords[index:index + size]
            count = 1
            while chords[index + count * size:index + (count + 1) * size] == unit:
                count += 1
            if count >= 2 and (best_unit is None or count * size > best_count * len(best_unit)):
                best_unit, best_count = unit, count
        if best_unit is None or (len(best_unit) == 1 and best_count < 3):
            loose.append(chords[index])
            index += 1
            continue
        if loose:
            parts.append((loose, 1))
            loose = []
        if len(best_unit) == 1:
            # Um acorde repetido (Am Am Am) não é progressão: entra uma vez nos acordes soltos.
            loose.append(best_unit[0])
        else:
            parts.append((best_unit, best_count))
        index += best_count * len(best_unit)
    if loose:
        parts.append((loose, 1))
    return parts



def _split_loops(chords: list[str]) -> list[tuple[list[str], int]] | None:
    """Partes da linha quando ela esconde um laço (Bm7 A E9 Bm7 A E9 Bm7 A E9 D -> [Bm7 A E9] 3x, [D])."""
    if len(chords) < _SEGMENT_MIN_CHORDS:
        return None
    parts = segment_progression(chords)
    if len(parts) > 1 and sum(len(unit) for unit, _ in parts) < len(chords):
        return parts
    return None


def block_needs_condensing(block) -> bool:
    """A linha do resumo não está numa volta só: ciclo inteiro repetido ou laço escondido no meio."""
    chords = list(block.acordes)
    condensed, _ = condense_progression(chords, block.repeticoes)
    return condensed != chords or _split_loops(chords) is not None


def _same_part(first: list[str], second: list[str]) -> bool:
    """Mesma parte da música escrita duas vezes: uma é começo da outra (a 2ª só emendou a volta seguinte).
    Com outros acordes (ex.: refrão final modulado) é outra parte e fica."""
    shorter, longer = (first, second) if len(first) <= len(second) else (second, first)
    return bool(shorter) and longer[:len(shorter)] == shorter


def has_repeated_phrase(blocks: list) -> bool:
    seen = {}
    for block in blocks:
        phrase = _fold(block.fraseGuia)
        if not phrase:
            continue
        if phrase in seen and _same_part(seen[phrase], list(block.acordes)):
            return True
        seen.setdefault(phrase, list(block.acordes))
    return False


_LOOP_UNIT_MAX = 8


def period_unit(chords: list[str]) -> list[str] | None:
    """Menor volta que gera a linha inteira, mesmo começando/terminando no meio dela.

    "Em C D G Em C D" -> [Em, C, D, G];  "G Em C D G" -> [G, Em, C, D];  "G Em C D" -> [G, Em, C, D].
    """
    chords = [chord for index, chord in enumerate(chords) if index == 0 or chord != chords[index - 1]]
    for size in range(2, min(len(chords), _LOOP_UNIT_MAX) + 1):
        unit = chords[:size]
        if len(set(unit)) < 2:
            continue
        if all(chord == unit[index % size] for index, chord in enumerate(chords)):
            return unit
    return None


def same_loop(first: list[str] | None, second: list[str] | None) -> bool:
    """A mesma volta, começando em qualquer acorde dela (G Em C D == Em C D G == C D G Em)."""
    if not first or not second or len(first) != len(second):
        return False
    doubled = first + first
    return any(doubled[start:start + len(second)] == second for start in range(len(first)))


def merge_rotated_loops(blocks: list) -> list:
    """Simplificando cifras: linhas seguidas que são a mesma volta viram uma linha só.

    Last Kiss: G Em C D | Em C D G Em C D | G Em C D G | Em C D G ... -> G Em C D (a música inteira).
    A letra quebrar no meio da volta não cria parte nova. A frase-guia é a da primeira linha; com frases
    diferentes a contagem sai (a música segue na mesma volta). Intro só de acordes seguida da parte
    cantada continua separada.
    """
    result, current_unit = [], None
    for block in blocks:
        unit = period_unit(block.acordes)
        previous = result[-1] if result else None
        same_phrase = previous is not None and _fold(previous.fraseGuia) == _fold(block.fraseGuia)
        # Volta curta (até 4 acordes) junta mesmo com frases diferentes; estrofe inteira com a mesma
        # harmonia e outra frase ("O céu começa..." / "Santo, Santo, Santo") continua separada.
        if (previous is not None and same_loop(current_unit, unit)
                and (same_phrase or len(unit) <= _LOOP_SHORT_CHORDS)
                and not (not previous.fraseGuia and block.fraseGuia)):
            previous.acordes = list(current_unit)
            if same_phrase:
                previous.repeticoes = min((previous.repeticoes or 1) + (block.repeticoes or 1), 99)
            else:
                previous.repeticoes = None
            previous.fraseGuia = previous.fraseGuia or block.fraseGuia
            continue
        result.append(block.model_copy(deep=True))
        current_unit = unit
    return result


def has_rotated_loops(blocks: list) -> bool:
    return len(merge_rotated_loops(blocks)) < len(blocks)


def drop_repeated_parts(blocks: list) -> list:
    """Padrão ROUDY: a mesma parte (mesma frase-guia, mesmos acordes) aparece uma vez só no resumo.
    Também tira a linha de um acorde só, sem frase, que é só o primeiro acorde da linha seguinte."""
    kept, seen = [], {}
    for block in blocks:
        phrase = _fold(block.fraseGuia)
        if phrase and phrase in seen and _same_part(seen[phrase], list(block.acordes)):
            continue
        if phrase:
            seen.setdefault(phrase, list(block.acordes))
        kept.append(block)
    result = []
    for index, block in enumerate(kept):
        following = kept[index + 1] if index + 1 < len(kept) else None
        if (len(block.acordes) == 1 and not block.fraseGuia and not block.repeticoes and following is not None
                and following.acordes and following.acordes[0] == block.acordes[0]):
            continue
        result.append(block)
    return result


def ensure_client_chords(response: ResumoHarmonicoResponse) -> ResumoHarmonicoResponse:
    """Última barreira antes de responder: todo acorde precisa passar no parseChord do frontend.

    Um único acorde fora do vocabulário faz o frontend descartar a resposta inteira, então aqui
    adaptamos o que for possível e omitimos o resto, registrando em observacoes.
    Vale também para respostas vindas do catálogo compartilhado, que não passam por normalize_response.
    """
    fixed = response.model_copy(deep=True)
    dropped = []

    def adapt(chord: str) -> str | None:
        try:
            candidate = normalize_chord(chord)
        except ValueError:
            candidate = None
        if candidate and is_client_chord(candidate):
            return candidate
        dropped.append(str(chord))
        return None

    if fixed.tom:
        fixed.tom = adapt(fixed.tom)
    for trecho in fixed.harmonicSummary.blocos:
        trecho.acordes = [chord for chord in (adapt(value) for value in trecho.acordes) if chord]
    fixed.harmonicSummary.blocos = [trecho for trecho in fixed.harmonicSummary.blocos if trecho.acordes]
    condensed = []
    for trecho in fixed.harmonicSummary.blocos:
        # Padrão ROUDY: resumo só com acordes e frases-gancho, sem nomes de seção.
        trecho.secao = None
        if trecho.fraseGuia and is_section_name(trecho.fraseGuia):
            trecho.fraseGuia = None
        trecho.acordes, trecho.repeticoes = condense_progression(trecho.acordes, trecho.repeticoes)
        if trecho.repeticoes == 1:
            trecho.repeticoes = None
        parts = _split_loops(trecho.acordes)
        if parts:
            # Sequência longa sem um único padrão: vira várias linhas "Am F Dm (5x)"; a frase fica na primeira.
            outer = trecho.repeticoes or 1
            for position, (unit, count) in enumerate(parts):
                piece = trecho.model_copy(deep=True)
                piece.acordes = unit
                piece.repeticoes = min(count * outer, 99) if count * outer > 1 else None
                if position:
                    piece.fraseGuia = None
                condensed.append(piece)
        else:
            condensed.append(trecho)
    fixed.harmonicSummary.blocos = drop_repeated_parts(merge_rotated_loops(merge_repeated_blocks(condensed)))[:40]
    if fixed.fullChordSheet:
        fixed.fullChordSheet.content = simplify_chord_text(fixed.fullChordSheet.content)
        for section in fixed.fullChordSheet.sections:
            for line in section.linhas:
                kept = []
                for item in line.acordes:
                    chord = adapt(item.acorde)
                    if chord:
                        item.acorde = chord
                        kept.append(item)
                line.acordes = kept
    if dropped:
        note = "Acordes não reconhecidos foram omitidos: " + ", ".join(sorted(set(dropped)))
        if note not in fixed.observacoes:
            fixed.observacoes = (fixed.observacoes + [note])[:20]
    if not fixed.harmonicSummary.blocos:
        raise ApiError("resultado_nao_confiavel", "Não foi possível produzir um resumo harmônico confiável.", 422)
    return fixed
