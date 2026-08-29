import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError, BadRequestError, RateLimitError

from app.schemas.resumo_harmonico import ResumoHarmonicoResponse, TrechoHarmonico
from app.services.content_extractor import ExtractedContent
from app.services.providers import (
    ProviderInvalidResponse,
    ProviderRateLimit,
    ProviderRequestRejected,
    ProviderStructuredResponseError,
    ProviderTimeout,
    ProviderUnavailable,
    ProviderUnexpectedError,
)
from app.services.providers.openai_provider import OpenAIProvider


class FakeResponses:
    def __init__(self, result):
        self.result = result
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(output_parsed=self.result)


class RaisingResponses:
    def __init__(self, error):
        self.error = error

    def parse(self, **_kwargs):
        raise self.error


def result():
    return ResumoHarmonicoResponse(titulo="Teste", tom="C", trechos=[TrechoHarmonico(acordes=["C"])], confianca="alta")


def test_image_is_sent_as_multimodal_input_with_structured_output():
    responses = FakeResponses(result())
    provider = OpenAIProvider("", "test-model", 1, 500, client=SimpleNamespace(responses=responses))
    media = ExtractedContent("image", None, "image/png", "data:image/png;base64,AAAA")
    provider.generate("system", "user", media)
    content = responses.kwargs["input"][1]["content"]
    assert content[1] == {"type": "input_image", "image_url": media.data_url}
    assert responses.kwargs["text_format"] is ResumoHarmonicoResponse
    assert responses.kwargs["reasoning"] == {"effort": "low"}


def test_pdf_is_sent_as_file_without_upload_persistence():
    responses = FakeResponses(result())
    provider = OpenAIProvider("", "test-model", 1, 500, client=SimpleNamespace(responses=responses))
    media = ExtractedContent("pdf", None, "application/pdf", "data:application/pdf;base64,AAAA", 1, "cifra.pdf")
    provider.generate("system", "user", media)
    item = responses.kwargs["input"][1]["content"][1]
    assert item == {"type": "input_file", "file_data": media.data_url, "filename": "cifra.pdf"}


def provider_raising(error):
    client = SimpleNamespace(responses=RaisingResponses(error))
    return OpenAIProvider("", "test-model", 1, 500, client=client)


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (APITimeoutError(request=httpx.Request("POST", "https://api.openai.com/v1/responses")), ProviderTimeout),
        (
            RateLimitError(
                "busy",
                response=httpx.Response(429, request=httpx.Request("POST", "https://api.openai.com/v1/responses")),
                body={},
            ),
            ProviderRateLimit,
        ),
        (
            BadRequestError(
                "bad payload",
                response=httpx.Response(400, request=httpx.Request("POST", "https://api.openai.com/v1/responses")),
                body={},
            ),
            ProviderRequestRejected,
        ),
        (json.JSONDecodeError("invalid", "x", 0), ProviderStructuredResponseError),
        (
            APIConnectionError(request=httpx.Request("POST", "https://api.openai.com/v1/responses")),
            ProviderUnavailable,
        ),
        (RuntimeError("unexpected"), ProviderUnexpectedError),
    ],
)
def test_provider_classifies_failures(error, expected):
    with pytest.raises(expected):
        provider_raising(error).generate("system", "user")


def test_invalid_provider_response_is_distinct():
    responses = FakeResponses(None)
    responses.result = None
    provider = OpenAIProvider("", "test-model", 1, 500, client=SimpleNamespace(responses=responses))
    with pytest.raises(ProviderInvalidResponse):
        provider.generate("system", "user")


def test_safe_log_preserves_ids_and_omits_musical_content(caplog):
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request, headers={"x-request-id": "req_openai_test"})
    error = RateLimitError("LETRA_SECRETA", response=response, body={})
    provider = provider_raising(error)
    media = ExtractedContent(
        "pdf", None, "application/pdf", "data:application/pdf;base64,CIFRA_SECRETA", 4,
        "musica-secreta.pdf", 395415,
    )
    with caplog.at_level(logging.ERROR):
        with pytest.raises(ProviderRateLimit):
            provider.generate(
                "SYSTEM_LETRA_SECRETA",
                "USER_CIFRA_SECRETA",
                media,
                context={
                    "request_id": "request-interno-123",
                    "input_type": "arquivo",
                    "classification": "visual",
                    "media_type": "application/pdf",
                    "page_count": 4,
                    "size_bytes": 395415,
                },
            )

    assert "request-interno-123" in caplog.text
    assert "req_openai_test" in caplog.text
    assert "395415" in caplog.text
    assert "LETRA_SECRETA" not in caplog.text
    assert "CIFRA_SECRETA" not in caplog.text
    assert "musica-secreta.pdf" not in caplog.text
