from io import BytesIO
from types import SimpleNamespace

import pytest
from werkzeug.datastructures import FileStorage

from app.errors import ApiError
from app.services import content_extractor


def upload(data, filename, mime):
    return FileStorage(stream=BytesIO(data), filename=filename, content_type=mime)


@pytest.mark.parametrize(
    ("data", "filename", "mime", "kind"),
    [
        (b"\x89PNG\r\n\x1a\ncontent", "cifra.png", "image/png", "image"),
        (b"\xff\xd8\xffcontent", "cifra.jpg", "image/jpeg", "image"),
        (b"RIFF\x00\x00\x00\x00WEBPcontent", "cifra.webp", "image/webp", "image"),
        (b"Tom: C\nC G Am F", "cifra.txt", "text/plain", "text"),
    ],
)
def test_supported_files(data, filename, mime, kind):
    result = content_extractor.extract_upload(upload(data, filename, mime), max_bytes=1024, max_pages=20, max_text_length=50000)
    assert result.kind == kind
    assert result.size_bytes == len(data)
    if kind == "image":
        assert result.data_url.startswith(f"data:{mime};base64,")


def test_textual_pdf_uses_local_text(monkeypatch):
    calls = []
    def extract_text(**kwargs):
        calls.append(kwargs)
        return "Tom: Dm\nDm   Bb   C   G\nOuçam o grito da vitória"
    pages = [SimpleNamespace(extract_text=extract_text)]
    monkeypatch.setattr(content_extractor, "PdfReader", lambda *_args, **_kwargs: SimpleNamespace(pages=pages))
    result = content_extractor.extract_upload(upload(b"%PDF-1.7 text", "cifra.pdf", "application/pdf"), max_bytes=1024, max_pages=20, max_text_length=50000)
    assert result.kind == "text"
    assert "Dm   Bb   C   G" in result.text
    assert result.page_count == 1
    assert result.filename == "cifra.pdf"
    assert calls == [{"extraction_mode": "layout"}]


def test_textual_pdf_removes_diagram_footer_and_keeps_instrumental_blocks(monkeypatch):
    text = """Batendo à Porta
[Intro]
C#m7  B2  F#m  A9

[Solo]
C#m7  B2  F#m  A9

A9          B2          B9          C#m          C#m7          E/G#          F#/A#
4           4           4

F#m
Página 5 de 5"""
    pages = [SimpleNamespace(extract_text=lambda **_kwargs: text)]
    monkeypatch.setattr(content_extractor, "PdfReader", lambda *_args, **_kwargs: SimpleNamespace(pages=pages))
    result = content_extractor.extract_upload(upload(b"%PDF-1.7 footer", "batendo.pdf", "application/pdf"), max_bytes=2048, max_pages=20, max_text_length=50000)
    assert "[Intro]" in result.text
    assert "[Solo]\nC#m7  B2  F#m  A9" in result.text
    assert "E/G#" not in result.text
    assert "Página 5 de 5" not in result.text


def test_pdf_edge_cleanup_preserves_real_music(monkeypatch):
    pages = [
        SimpleNamespace(extract_text=lambda **_kwargs: "Cifra Club\n[Intro]\nF  Am  G  C\nPagina 1 de 2"),
        SimpleNamespace(extract_text=lambda **_kwargs: "Cifra Club\n[Interludio]\nF  Am  G  C\nPagina 2 de 2"),
    ]
    monkeypatch.setattr(content_extractor, "PdfReader", lambda *_args, **_kwargs: SimpleNamespace(pages=pages))
    result = content_extractor.extract_upload(upload(b"%PDF-1.7 edges", "cultura.pdf", "application/pdf"), max_bytes=2048, max_pages=20, max_text_length=50000)
    assert "Cifra Club" not in result.text
    assert "Pagina" not in result.text
    assert "[Intro]\nF  Am  G  C" in result.text
    assert "[Interludio]\nF  Am  G  C" in result.text


def test_image_pdf_uses_visual_input(monkeypatch):
    pages = [SimpleNamespace(extract_text=lambda: "")]
    monkeypatch.setattr(content_extractor, "PdfReader", lambda *_args, **_kwargs: SimpleNamespace(pages=pages))
    result = content_extractor.extract_upload(upload(b"%PDF-1.7 image", "scan.pdf", "application/pdf"), max_bytes=1024, max_pages=20, max_text_length=50000)
    assert result.kind == "pdf"
    assert result.data_url.startswith("data:application/pdf;base64,")
    assert result.page_count == 1
    assert result.size_bytes == len(b"%PDF-1.7 image")


def test_rejects_mime_spoof_and_large_file():
    with pytest.raises(ApiError) as mismatch:
        content_extractor.extract_upload(upload(b"\x89PNG\r\n\x1a\n", "fake.jpg", "image/jpeg"), max_bytes=1024, max_pages=20, max_text_length=50000)
    assert mismatch.value.code == "tipo_arquivo_invalido"
    with pytest.raises(ApiError) as large:
        content_extractor.extract_upload(upload(b"x" * 20, "large.txt", "text/plain"), max_bytes=10, max_pages=20, max_text_length=50000)
    assert large.value.code == "arquivo_muito_grande"


def test_pdf_page_limit(monkeypatch):
    monkeypatch.setattr(content_extractor, "PdfReader", lambda *_args, **_kwargs: SimpleNamespace(pages=[SimpleNamespace(extract_text=lambda: "") for _ in range(21)]))
    with pytest.raises(ApiError) as error:
        content_extractor.extract_upload(upload(b"%PDF-1.7 pages", "long.pdf", "application/pdf"), max_bytes=1024, max_pages=20, max_text_length=50000)
    assert error.value.code == "pdf_paginas_invalidas"
