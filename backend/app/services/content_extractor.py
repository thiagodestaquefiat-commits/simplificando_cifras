from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from ..errors import ApiError


ALLOWED_MIMES = {
    "text/plain": "txt",
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
ALLOWED_EXTENSIONS = {
    "text/plain": {".txt"},
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/webp": {".webp"},
}


@dataclass(frozen=True)
class ExtractedContent:
    kind: str
    text: str | None
    media_type: str
    data_url: str | None = None
    page_count: int | None = None
    filename: str | None = None
    size_bytes: int | None = None


def _detected_mime(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    try:
        decoded = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    if "\x00" not in decoded:
        return "text/plain"
    return None


def _data_url(data: bytes, mime: str) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _extract_pdf_layout(page) -> str:
    """Preserva colunas/posições de cifras textuais em vez de agrupar acordes no fim."""
    try:
        return page.extract_text(extraction_mode="layout") or ""
    except TypeError:  # compatibilidade com leitores/mocks mais antigos
        return page.extract_text() or ""


_PAGE_MARKER_RE = re.compile(
    r"^\s*(?:p(?:á|a)gina\s+)?\d+\s*(?:/|de)\s*\d+\s*$|^\s*-\s*\d+\s*-\s*$",
    re.IGNORECASE,
)
_TECHNICAL_EDGE_RE = re.compile(r"(?:https?://|www\.|cifra\s*club|©|todos os direitos)", re.IGNORECASE)
_DIAGRAM_TECHNICAL_RE = re.compile(r"^\s*(?:(?:\d+|[xX]|[-|]{2,})\s*){2,}$")
_DIAGRAM_CHORD_RE = re.compile(
    r"^[A-G](?:#|b)?(?:m|maj|M|dim|aug|sus|add|[0-9+°øΔ#b()]|/)*"
    r"(?:/[A-G](?:#|b)?)?$"
)


def _is_chord_legend(line: str) -> bool:
    tokens = [token.strip("[](){},;:|") for token in line.split()]
    return len(tokens) >= 5 and all(_DIAGRAM_CHORD_RE.fullmatch(token) for token in tokens)


def _strip_page_edge_noise(text: str) -> str:
    """Remove somente marcadores técnicos inequívocos nas bordas da página."""
    lines = text.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    for edge in (0, -1):
        while lines:
            value = lines[edge].strip()
            if not (_PAGE_MARKER_RE.fullmatch(value) or _TECHNICAL_EDGE_RE.search(value)):
                break
            lines.pop(edge)
    return "\n".join(lines).strip()


def _strip_trailing_diagram_footer(text: str) -> str:
    """Descarta legenda de diagramas no fim sem confundir progressão instrumental."""
    lines = text.splitlines()
    last_nonempty = max((index for index, line in enumerate(lines) if line.strip()), default=-1)
    if last_nonempty < 0:
        return ""
    tail_start = max(0, last_nonempty - 24)
    for index in range(tail_start, last_nonempty + 1):
        line = lines[index]
        if not _is_chord_legend(line):
            continue
        following = [value for value in lines[index + 1:last_nonempty + 1] if value.strip()]
        has_technical_row = any(_DIAGRAM_TECHNICAL_RE.fullmatch(value) for value in following)
        only_technical_or_chords = all(
            _DIAGRAM_TECHNICAL_RE.fullmatch(value) or _is_chord_legend(value) or
            _DIAGRAM_CHORD_RE.fullmatch(value.strip())
            for value in following
        )
        if has_technical_row and only_technical_or_chords:
            return "\n".join(lines[:index]).rstrip()
    return text.strip()


def clean_pdf_text(page_texts: list[str]) -> str:
    cleaned_pages = [_strip_page_edge_noise(value) for value in page_texts]
    return clean_musical_text("\n\n".join(value for value in cleaned_pages if value))


TECHNICAL_LABEL_RE = re.compile(
    r"^\s*(?:afina[çc][ãa]o|tuning|capotraste|capo|tom|tonalidade|t[íi]tulo|artista|"
    r"compositor|composi[çc][ãa]o|transcri[çc][ãa]o|legenda(?: de acordes)?|"
    r"diagramas?(?: de acordes)?|acordes (?:utilizados|usados)|metadados)\s*(?::.*)?$", re.I)
TECHNICAL_BLOCK_RE = re.compile(r"^\s*(?:metadados|legenda(?: de acordes)?|diagramas?(?: de acordes)?|acordes (?:utilizados|usados))\s*:?\s*$", re.I)
MUSICAL_SECTION_RE = re.compile(r"^\s*[\[(]?(?:intro(?:du[çc][ãa]o)?|verso|pr[ée][- ]refr[ãa]o|refr[ãa]o|ponte|interl[úu]dio|solo|final|outro)(?:\s+\d+)?[\])]?:?\s*$", re.I)


def is_technical_line(line: str) -> bool:
    return bool(TECHNICAL_LABEL_RE.fullmatch(line) or _PAGE_MARKER_RE.fullmatch(line)
                or re.fullmatch(r"\s*\d+\s*", line)
                or _DIAGRAM_TECHNICAL_RE.fullmatch(line))


def clean_musical_text(text: str, metadata=()) -> str:
    """Keep musical spacing; remove only explicit technical context, never lone chords."""
    lines = _strip_trailing_diagram_footer(_strip_page_edge_noise(text)).splitlines()
    output, technical, musical = [], False, False
    names = {str(value).strip().casefold() for value in metadata if value}
    for index, line in enumerate(lines):
        stripped = line.strip()
        if TECHNICAL_BLOCK_RE.fullmatch(stripped):
            technical = True
            continue
        if MUSICAL_SECTION_RE.fullmatch(stripped):
            technical = False
            musical = True
        if is_technical_line(line):
            continue
        # Exact title/artist only at document edges or in a labelled metadata block.
        if stripped.casefold() in names and (technical or (not musical and index < 3)):
            continue
        if technical and stripped:
            tokens = stripped.split()
            if all(_DIAGRAM_CHORD_RE.fullmatch(token) for token in tokens):
                continue
            # Prose outside the technical vocabulary resumes musical content.
            technical = False
        if stripped and all(_DIAGRAM_CHORD_RE.fullmatch(token) for token in stripped.split()):
            musical = True
        output.append(line)
    return "\n".join(output).strip()


def extract_upload(file_storage, *, max_bytes: int, max_pages: int, max_text_length: int) -> ExtractedContent:
    if file_storage is None or not file_storage.filename:
        raise ApiError("arquivo_obrigatorio", "Selecione um arquivo para analisar.", 400)

    data = file_storage.read(max_bytes + 1)
    if not data:
        raise ApiError("arquivo_invalido", "O arquivo enviado estÃ¡ vazio.", 400)
    if len(data) > max_bytes:
        raise ApiError("arquivo_muito_grande", f"O arquivo deve ter no mÃ¡ximo {max_bytes // (1024 * 1024)} MB.", 413)

    detected = _detected_mime(data)
    declared = (file_storage.mimetype or "").lower().split(";", 1)[0]
    extension = Path(file_storage.filename).suffix.lower()
    if (
        detected not in ALLOWED_MIMES
        or declared not in ALLOWED_MIMES
        or detected != declared
        or extension not in ALLOWED_EXTENSIONS.get(detected, set())
    ):
        raise ApiError("tipo_arquivo_invalido", "Envie PDF, PNG, JPG, WebP ou TXT vÃ¡lido.", 415)

    if detected == "text/plain":
        text = data.decode("utf-8-sig").replace("\x00", "").strip()
        if not text:
            raise ApiError("arquivo_invalido", "O arquivo de texto estÃ¡ vazio.", 400)
        if len(text) > max_text_length:
            raise ApiError("arquivo_muito_grande", "O texto extraÃ­do excede o limite permitido.", 413)
        return ExtractedContent("text", text, detected, size_bytes=len(data))

    if detected.startswith("image/"):
        return ExtractedContent("image", None, detected, _data_url(data, detected), size_bytes=len(data))

    try:
        reader = PdfReader(BytesIO(data), strict=False)
        pages = len(reader.pages)
        if pages < 1 or pages > max_pages:
            raise ApiError("pdf_paginas_invalidas", f"O PDF deve possuir entre 1 e {max_pages} pÃ¡ginas.", 400)
        text = clean_pdf_text([_extract_pdf_layout(page) for page in reader.pages])
    except ApiError:
        raise
    except Exception as error:
        raise ApiError("arquivo_invalido", "NÃ£o foi possÃ­vel ler este PDF.", 400) from error

    if text and len(text) <= max_text_length and len(text) >= 40:
        return ExtractedContent("text", text, detected, page_count=pages, filename=file_storage.filename, size_bytes=len(data))
    return ExtractedContent("pdf", None, detected, _data_url(data, detected), pages, file_storage.filename, len(data))
