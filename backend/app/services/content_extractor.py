from __future__ import annotations

import base64
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
        text = "\n\n".join(_extract_pdf_layout(page).strip() for page in reader.pages).strip()
    except ApiError:
        raise
    except Exception as error:
        raise ApiError("arquivo_invalido", "NÃ£o foi possÃ­vel ler este PDF.", 400) from error

    if text and len(text) <= max_text_length and len(text) >= 40:
        return ExtractedContent("text", text, detected, page_count=pages, filename=file_storage.filename, size_bytes=len(data))
    return ExtractedContent("pdf", None, detected, _data_url(data, detected), pages, file_storage.filename, len(data))
