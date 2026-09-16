import json
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx2
import pytest

from app.services.anthropic_song_analysis import (
    AnthropicExperimentError,
    AnthropicSongAnalysisService,
)


def auth_headers(client):
    registered = client.post(
        "/api/collaboration/users",
        json={"id": f"anthropic-user-{uuid.uuid4()}", "name": "Teste Anthropic"},
    )
    assert registered.status_code == 201
    return {"Authorization": f"Bearer {registered.get_json()['accessToken']}"}


def usage(input_tokens=10, output_tokens=20, searches=0):
    return SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        server_tool_use=SimpleNamespace(web_search_requests=searches),
    )


def evidence(*, text="Evidências musicais verificadas.", sources=None, searches=1):
    citations = [
        {"type": "web_search_result_location", "url": url, "title": title}
        for url, title in ([('https://example.com/song', 'Fonte musical')] if sources is None else sources)
    ]
    return SimpleNamespace(
        content=[{"type": "text", "text": text, "citations": citations}],
        usage=usage(searches=searches),
        stop_reason="end_turn",
    )


def normalized(**changes):
    payload = {
        "song": "Na Sua Estante",
        "artist": "Pitty",
        "key": "E minor",
        "capo": None,
        "tuning": "standard",
        "chords": ["Em", "C", "G", "D"],
        "sections": [{
            "type": "verse",
            "name": "Verso",
            "progression": ["Em", "C"],
            "order": 1,
            "note": "Progressão indicada pelas fontes.",
            "hook": "",
        }],
        "harmonic_summary": ["Centro tonal menor com progressão diatônica."],
        "confidence": {"overall": 0.82, "key": 0.75, "chords": 0.84, "structure": 0.7},
        "sources": [],
        "warnings": [],
    }
    payload.update(changes)
    return SimpleNamespace(
        content=[{"type": "text", "text": json.dumps(payload)}],
        usage=usage(7, 11),
        stop_reason="end_turn",
    )


class FakeMessages:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def service(responses, *, api_key="test-key"):
    messages = FakeMessages(responses)
    client = SimpleNamespace(messages=messages)
    instance = AnthropicSongAnalysisService(
        api_key=api_key,
        model="claude-sonnet-5",
        timeout_seconds=1,
        search_max_tokens=1000,
        normalize_max_tokens=1000,
        web_search_max_uses=3,
        client=client,
    )
    return instance, messages


def test_known_song_uses_web_search_then_structured_output():
    instance, messages = service([evidence(searches=2), normalized()])
    result = instance.analyze("Na Sua Estante", "Pitty", request_id="internal-test")

    assert result["song"] == "Na Sua Estante"
    assert result["key"] == "E minor"
    assert result["sources"] == [{"url": "https://example.com/song", "title": "Fonte musical"}]
    assert result["usage"]["webSearches"] == 2
    assert result["usage"]["inputTokens"] == 17
    assert result["usage"]["stages"]["search"]["inputTokens"] == 10
    assert result["usage"]["stages"]["search"]["outputTokens"] == 20
    assert result["usage"]["stages"]["search"]["sources"] == 1
    assert result["usage"]["stages"]["normalization"]["inputTokens"] == 7
    assert result["usage"]["stages"]["normalization"]["outputTokens"] == 11
    assert messages.calls[0]["tools"] == [{
        "type": "web_search_20250305", "name": "web_search", "max_uses": 2,
    }]
    assert messages.calls[0]["thinking"] == {"type": "disabled"}
    assert "output_config" not in messages.calls[0]
    assert messages.calls[1]["output_config"]["format"]["type"] == "json_schema"
    assert messages.calls[1]["thinking"] == {"type": "disabled"}
    assert "tools" not in messages.calls[1]

    sent_schema = messages.calls[1]["output_config"]["format"]["schema"]
    serialized_schema = json.dumps(sent_schema)
    for unsupported in ("minimum", "maximum", "minLength", "maxLength", "maxItems"):
        assert f'"{unsupported}"' not in serialized_schema


def test_nonexistent_song_stays_uncertain_without_inventing_sources():
    result = service([
        evidence(text="Nenhuma correspondência confiável.", sources=[], searches=2),
        normalized(key=None, chords=[], sections=[], harmonic_summary=[], warnings=["Música não encontrada."],
                   confidence={"overall": 0.0, "key": 0.0, "chords": 0.0, "structure": 0.0}),
    ])[0].analyze("Música inexistente xyz", "Artista inexistente")
    assert result["key"] is None
    assert result["chords"] == []
    assert result["warnings"] == ["Música não encontrada."]


def test_wrong_artist_is_reported_as_warning():
    result = service([
        evidence(text="O título foi encontrado, mas atribuído a outro artista."),
        normalized(warnings=["O artista informado diverge das fontes."],
                   confidence={"overall": 0.3, "key": 0.2, "chords": 0.2, "structure": 0.1}),
    ])[0].analyze("Canção", "Artista errado")
    assert "diverge" in result["warnings"][0]


def test_divergent_sources_preserve_both_urls_and_warning():
    result = service([
        evidence(sources=[("https://one.example/song", "Fonte 1"), ("https://two.example/song", "Fonte 2")]),
        normalized(warnings=["As fontes divergem sobre a tonalidade."]),
    ])[0].analyze("Canção", "Artista")
    assert {item["url"] for item in result["sources"]} == {
        "https://one.example/song", "https://two.example/song",
    }
    assert "divergem" in result["warnings"][0]


def test_sources_fall_back_to_web_results_when_final_text_has_no_citations():
    response = evidence(sources=[])
    response.content.insert(0, {
        "type": "web_search_tool_result",
        "content": [
            {"type": "web_search_result", "url": "https://one.example/song", "title": "Fonte 1"},
            {"type": "web_search_result", "url": "https://two.example/song", "title": "Fonte 2"},
        ],
    })
    result = service([response, normalized()])[0].analyze("Canção", "Artista")
    assert [item["url"] for item in result["sources"]] == [
        "https://one.example/song", "https://two.example/song",
    ]


def test_missing_key_remains_null_with_low_confidence():
    result = service([
        evidence(text="Foram encontradas informações de estrutura, mas não tonalidade."),
        normalized(key=None, warnings=["Tonalidade não confirmada."],
                   confidence={"overall": 0.5, "key": 0.0, "chords": 0.6, "structure": 0.7}),
    ])[0].analyze("Canção", "Artista")
    assert result["key"] is None
    assert result["confidence"]["key"] == 0.0


def test_web_search_without_text_is_controlled_failure():
    instance, _ = service([evidence(text="", sources=[], searches=1)])
    with pytest.raises(AnthropicExperimentError) as raised:
        instance.analyze("Canção", "Artista")
    assert raised.value.code == "anthropic_resposta_incompleta"


def test_missing_api_key_is_controlled():
    with pytest.raises(AnthropicExperimentError) as raised:
        AnthropicSongAnalysisService(
            api_key="", model="claude-sonnet-5", timeout_seconds=1,
            search_max_tokens=100, normalize_max_tokens=100, web_search_max_uses=3,
        )
    assert raised.value.code == "anthropic_nao_configurada"


def test_anthropic_unavailable_is_classified():
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    instance, _ = service([anthropic.APIConnectionError(request=request)])
    with pytest.raises(AnthropicExperimentError) as raised:
        instance.analyze("Canção", "Artista")
    assert raised.value.code == "anthropic_indisponivel"


def test_anthropic_rate_limit_is_classified():
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(429, request=request)
    instance, _ = service([anthropic.RateLimitError("rate", response=response, body=None)])
    with pytest.raises(AnthropicExperimentError) as raised:
        instance.analyze("Canção", "Artista")
    assert raised.value.code == "anthropic_limite"
    assert raised.value.status_code == 429


@pytest.mark.parametrize(("message", "code"), [
    ("Web search is not enabled for this organization", "anthropic_web_search_desabilitada"),
    ("web_search_20250305 is not supported by this model", "anthropic_web_search_indisponivel"),
    ("Your credit balance is too low", "anthropic_creditos_indisponiveis"),
    ("The requested model is not available", "anthropic_modelo_indisponivel"),
    ("tools.0 has an invalid field", "anthropic_requisicao_invalida"),
])
def test_bad_request_has_safe_specific_classification(message, code):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(400, request=request)
    error = anthropic.BadRequestError(
        message,
        response=response,
        body={"type": "error", "error": {"type": "invalid_request_error", "message": message}},
    )
    instance, _ = service([error])
    with pytest.raises(AnthropicExperimentError) as raised:
        instance.analyze("Canção", "Artista")
    assert raised.value.code == code


@pytest.mark.parametrize(("message", "field"), [
    ("web_search_20250305 is invalid", "web_search"),
    ("max_tokens must be larger", "max_tokens"),
    ("thinking configuration is invalid", "thinking"),
    ("output_config.format is invalid", "output_config"),
])
def test_provider_metadata_logs_only_safe_rejected_field(message, field):
    metadata = AnthropicSongAnalysisService._provider_error_metadata(
        SimpleNamespace(
            status_code=400,
            request_id="req-safe",
            body={"error": {"type": "invalid_request_error", "message": message}},
        )
    )
    assert metadata["providerRejectedField"] == field
    assert message not in metadata.values()


def test_partial_structured_response_is_rejected_without_regex_repair():
    partial = SimpleNamespace(
        content=[{"type": "text", "text": '{"song":"Na Sua Estante"'}],
        usage=usage(),
        stop_reason="max_tokens",
    )
    instance, _ = service([evidence(), partial])
    with pytest.raises(AnthropicExperimentError) as raised:
        instance.analyze("Na Sua Estante", "Pitty")
    assert raised.value.code == "anthropic_resposta_invalida"


@patch("app.routes.anthropic_ai.AnthropicSongAnalysisService.from_config")
def test_endpoint_requires_auth_and_valid_song_artist(from_config, client):
    assert client.post("/api/ai/anthropic/song-analysis", json={"song": "A", "artist": "B"}).status_code == 401
    headers = auth_headers(client)
    assert client.post("/api/ai/anthropic/song-analysis", json={"song": "", "artist": "Pitty"}, headers=headers).status_code == 400
    assert client.post("/api/ai/anthropic/song-analysis", json={"song": "Na Sua Estante", "artist": ""}, headers=headers).status_code == 400
    assert from_config.call_count == 0


@patch("app.routes.anthropic_ai.AnthropicSongAnalysisService.from_config")
def test_endpoint_returns_experimental_result_without_exposing_key(from_config, client):
    expected = {
        "song": "Na Sua Estante", "artist": "Pitty", "key": None, "capo": None,
        "tuning": None, "chords": [], "sections": [], "harmonic_summary": [],
        "confidence": {"overall": 0, "key": 0, "chords": 0, "structure": 0},
        "sources": [], "warnings": ["Sem evidências."],
        "usage": {"model": "test-claude-model", "inputTokens": 1, "outputTokens": 1, "webSearches": 1, "durationMs": 10},
    }
    from_config.return_value.analyze.return_value = expected
    response = client.post(
        "/api/ai/anthropic/song-analysis",
        json={"song": "Na Sua Estante", "artist": "Pitty"},
        headers=auth_headers(client),
    )
    assert response.status_code == 200
    assert response.get_json() == expected
    assert "test-anthropic-key" not in response.get_data(as_text=True)


@patch("app.routes.anthropic_ai.AnthropicSongAnalysisService.from_config")
def test_endpoint_cache_normalizes_identity_and_avoids_second_provider_call(from_config, client):
    expected = {
        "song": "Na Sua Estante", "artist": "Pitty", "key": "D", "capo": 0,
        "tuning": "Drop D", "chords": ["D"], "sections": [], "harmonic_summary": [],
        "confidence": {"overall": 0.8, "key": 0.8, "chords": 0.8, "structure": 0.6},
        "sources": [{"url": "https://example.com", "title": "Fonte"}], "warnings": [],
        "usage": {"model": "test", "inputTokens": 10, "outputTokens": 5, "webSearches": 1, "durationMs": 100},
    }
    from_config.return_value.analyze.return_value = expected
    headers = auth_headers(client)
    first = client.post("/api/ai/anthropic/song-analysis", json={"song": "Na Sua Estante", "artist": "Pitty"}, headers=headers)
    second = client.post("/api/ai/anthropic/song-analysis", json={"song": "  NA SUA   ESTANTE ", "artist": "pítty"}, headers=headers)
    assert first.status_code == 200
    assert first.get_json()["usage"]["cacheHit"] is False
    assert second.status_code == 200
    assert second.get_json()["usage"]["cacheHit"] is True
    assert from_config.return_value.analyze.call_count == 1
