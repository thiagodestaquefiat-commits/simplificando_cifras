from types import SimpleNamespace

import pytest

from app.services.content_extractor import ExtractedContent
from app.services.providers import ProviderError, ProviderRequestRejected
from app.services.providers.deepseek_provider import DeepSeekProvider


def test_requires_backend_api_key():
    with pytest.raises(ProviderError, match="DEEPSEEK_API_KEY"):
        DeepSeekProvider("", "deepseek-flash", 90, 12000)


def test_rejects_scanned_pdf_before_external_request():
    responses = SimpleNamespace(parse=lambda **_kwargs: pytest.fail("provider must not be called"))
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=SimpleNamespace(responses=responses))
    media = ExtractedContent(
        "pdf",
        None,
        "application/pdf",
        "data:application/pdf;base64,AAAA",
        page_count=1,
        filename="scan.pdf",
    )

    with pytest.raises(ProviderRequestRejected):
        provider.generate("system", "user", media)


def test_rejects_scanned_pdf_inside_multi_file_upload():
    responses = SimpleNamespace(parse=lambda **_kwargs: pytest.fail("provider must not be called"))
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=SimpleNamespace(responses=responses))
    image = ExtractedContent("image", None, "image/png", "data:image/png;base64,AAAA")
    pdf = ExtractedContent("pdf", None, "application/pdf", "data:application/pdf;base64,BBBB")
    bundle = ExtractedContent("bundle", None, "multipart/mixed", items=(image, pdf))

    with pytest.raises(ProviderRequestRejected):
        provider.generate("system", "user", bundle)
