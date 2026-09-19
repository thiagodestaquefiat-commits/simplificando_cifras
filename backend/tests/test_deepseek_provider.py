import json
import logging
from types import SimpleNamespace

import httpx
import pytest
from openai import BadRequestError
from openai.types.responses.response import Response

from app.schemas.resumo_harmonico import ResumoEstruturado, ResumoHarmonicoResponse, TrechoHarmonico
from app.services.content_extractor import ExtractedContent
from app.services.providers import (
    ProviderError,
    ProviderInvalidResponse,
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


def sdk_response(*, status, output=None, error=None, incomplete_details=None):
    return Response.model_validate({
        "id": "resp_deepseek_test",
        "object": "response",
        "created_at": 1,
        "model": "deepseek-flash",
        "status": status,
        "error": error,
        "incomplete_details": incomplete_details,
        "output": output or [],
        "parallel_tool_calls": True,
        "tool_choice": "auto",
        "tools": [],
        "usage": {
            "input_tokens": 321,
            "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
            "output_tokens": 45,
            "output_tokens_details": {"reasoning_tokens": 44},
            "total_tokens": 366,
        },
    })


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (sdk_response(status="completed"), {
            "response_status": "completed", "response_error_code": None,
            "incomplete_reason": None, "output_item_types": [], "output_block_types": [],
        }),
        (sdk_response(status="completed", output=[{
            "id": "rs_test", "type": "reasoning", "status": "completed", "summary": [],
            "content": [{"type": "reasoning_text", "text": "CONTEUDO_SENSIVEL"}],
        }]), {
            "response_status": "completed", "response_error_code": None,
            "incomplete_reason": None, "output_item_types": ["reasoning"],
            "output_block_types": ["reasoning_text"],
        }),
        (sdk_response(status="incomplete", incomplete_details={"reason": "max_output_tokens"}), {
            "response_status": "incomplete", "response_error_code": None,
            "incomplete_reason": "max_output_tokens", "output_item_types": [], "output_block_types": [],
        }),
        (sdk_response(status="failed", error={"code": "server_error", "message": "CONTEUDO_SENSIVEL"}), {
            "response_status": "failed", "response_error_code": "server_error",
            "incomplete_reason": None, "output_item_types": [], "output_block_types": [],
        }),
    ],
)
def test_empty_output_logs_only_safe_response_diagnostics(response, expected, caplog):
    client = SimpleNamespace(responses=SimpleNamespace(create=lambda **_kwargs: response))
    provider = DeepSeekProvider("", "deepseek-flash", 90, 12000, client=client)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(ProviderInvalidResponse):
            provider.generate("PROMPT_SENSIVEL", "CIFRA_SENSIVEL")

    event = json.loads(caplog.records[-1].message.split("=", 1)[1])
    assert {key: event[key] for key in expected} == expected
    assert event["output_text_length"] == 0
    assert event["input_tokens"] == 321
    assert event["output_tokens"] == 45
    assert event["reasoning_tokens"] == 44
    assert "CONTEUDO_SENSIVEL" not in caplog.text
    assert "PROMPT_SENSIVEL" not in caplog.text
    assert "CIFRA_SENSIVEL" not in caplog.text


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
