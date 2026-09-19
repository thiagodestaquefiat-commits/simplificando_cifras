import json
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError

from app.schemas.resumo_harmonico import ResumoEstruturado, ResumoHarmonicoResponse, TrechoHarmonico
from app.services.content_extractor import ExtractedContent
from app.services.providers import (
    ProviderError,
    ProviderRequestRejected,
    ProviderStructuredResponseError,
)
from app.services.providers.deepseek_provider import DeepSeekProvider


class FakeResponses:
    def __init__(self, output_text):
        self.output_text = output_text
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(output_text=self.output_text, _request_id="req_deepseek_test")


class RaisingResponses:
    def __init__(self, error):
        self.error = error

    def create(self, **_kwargs):
        raise self.error


def valid_result():
    return ResumoHarmonicoResponse(
        titulo="Teste",
        tom="C",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(acordes=["C", "G"])]),
        confianca="alta",
    )


def provider_with_output(output_text):
    responses = FakeResponses(output_text)
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=SimpleNamespace(responses=responses))
    return provider, responses


def test_requires_backend_api_key():
    with pytest.raises(ProviderError, match="DEEPSEEK_API_KEY"):
        DeepSeekProvider("", "deepseek-flash", 90, 12000)


def test_valid_json_is_parsed_and_validated_locally():
    expected = valid_result()
    provider, responses = provider_with_output(expected.model_dump_json(by_alias=True))

    result = provider.generate("Retorne somente JSON válido.", "Tom: C\nC G")

    assert result == expected
    assert responses.kwargs["model"] == "deepseek-flash"
    assert responses.kwargs["text"] == {"format": {"type": "json_object"}}
    assert "text_format" not in responses.kwargs


def test_invalid_json_is_rejected():
    provider, _responses = provider_with_output("{json inválido")

    with pytest.raises(ProviderStructuredResponseError):
        provider.generate("Retorne somente JSON válido.", "Tom: C\nC G")


def test_valid_json_with_incompatible_contract_is_rejected():
    provider, _responses = provider_with_output(json.dumps({"titulo": "Sem contrato completo"}))

    with pytest.raises(ProviderStructuredResponseError):
        provider.generate("Retorne somente JSON válido.", "Tom: C\nC G")


def test_http_error_is_classified_without_exposing_provider_body():
    request = httpx.Request("POST", "https://api.deepseek.com/responses")
    response = httpx.Response(400, request=request)
    error = BadRequestError("schema inválido", response=response, body={})
    client = SimpleNamespace(responses=RaisingResponses(error))
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=client)

    with pytest.raises(ProviderRequestRejected):
        provider.generate("Retorne somente JSON válido.", "Tom: C\nC G")


def test_text_uses_responses_json_mode():
    provider, responses = provider_with_output(valid_result().model_dump_json())

    provider.generate("Retorne somente JSON válido.", "Tom: C\nC G")

    assert responses.kwargs["input"][1]["content"] == [
        {"type": "input_text", "text": "Tom: C\nC G"}
    ]


def test_image_is_sent_as_multimodal_input_in_json_mode():
    provider, responses = provider_with_output(valid_result().model_dump_json())
    media = ExtractedContent("image", None, "image/png", "data:image/png;base64,AAAA")

    provider.generate("Retorne somente JSON válido.", "Analise a imagem", media)

    assert responses.kwargs["input"][1]["content"] == [
        {"type": "input_text", "text": "Analise a imagem"},
        {"type": "input_image", "image_url": media.data_url},
    ]


def test_rejects_scanned_pdf_before_external_request():
    responses = SimpleNamespace(create=lambda **_kwargs: pytest.fail("provider must not be called"))
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
    responses = SimpleNamespace(create=lambda **_kwargs: pytest.fail("provider must not be called"))
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=SimpleNamespace(responses=responses))
    image = ExtractedContent("image", None, "image/png", "data:image/png;base64,AAAA")
    pdf = ExtractedContent("pdf", None, "application/pdf", "data:application/pdf;base64,BBBB")
    bundle = ExtractedContent("bundle", None, "multipart/mixed", items=(image, pdf))

    with pytest.raises(ProviderRequestRejected):
        provider.generate("system", "user", bundle)
