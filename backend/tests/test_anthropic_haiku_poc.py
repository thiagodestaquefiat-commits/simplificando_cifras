import json
from types import SimpleNamespace

import pytest

from app.services.anthropic_haiku_poc import AnthropicHaikuPocError, AnthropicHaikuPocService


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def create(
        self,
        *,
        model,
        max_tokens,
        thinking,
        system,
        messages,
        output_config,
    ):
        self.calls.append(
            {
                "model": model,
                "max_tokens": max_tokens,
                "thinking": thinking,
                "system": system,
                "messages": messages,
                "output_config": output_config,
            }
        )
        if self.error:
            raise self.error
        return self.response


def _response(*, stop_reason="end_turn", text=None):
    payload = {
        "key": "D",
        "chords": ["D", "G", "A"],
        "sections": [
            {"type": "chorus", "name": "Refrão", "progression": ["D", "G", "A"], "order": 1}
        ],
        "harmonic_summary": ["REFRÃO: D - G - A"],
        "confidence": {"overall": 0.6, "key": 0.6, "chords": 0.5, "structure": 0.4},
        "warnings": ["Conhecimento interno sem fonte externa."],
    }
    return SimpleNamespace(
        model="claude-haiku-4-5-20251001",
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=text if text is not None else json.dumps(payload))],
        usage=SimpleNamespace(input_tokens=180, output_tokens=110),
        _request_id="req_mock",
    )


def test_compact_poc_makes_one_call_without_temperature_tools_or_web_search():
    messages = FakeMessages(response=_response())
    result = AnthropicHaikuPocService("test", client=SimpleNamespace(messages=messages)).run(
        request_id="app_mock"
    )

    assert len(messages.calls) == 1
    call = messages.calls[0]
    assert call["model"] == "claude-haiku-4-5-20251001"
    assert call["max_tokens"] == 1200
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert "temperature" not in call
    assert "tools" not in call
    assert result["usage"]["anthropicCalls"] == 1
    assert result["usage"]["webSearches"] == 0
    assert result["usage"]["stopReason"] == "end_turn"
    assert result["usage"]["requestId"] == "req_mock"
    assert result["usage"]["stage"] == "completed"


def test_provider_failure_stops_after_the_single_attempt():
    messages = FakeMessages(error=RuntimeError("provider failed"))
    service = AnthropicHaikuPocService("test", client=SimpleNamespace(messages=messages))

    with pytest.raises(AnthropicHaikuPocError, match="Haiku falhou"):
        service.run(request_id="app_mock")

    assert len(messages.calls) == 1


def test_max_tokens_is_reported_as_truncation_without_a_second_call():
    messages = FakeMessages(response=_response(stop_reason="max_tokens", text='{"key":"D"'))
    service = AnthropicHaikuPocService("test", client=SimpleNamespace(messages=messages))

    with pytest.raises(AnthropicHaikuPocError, match="truncada"):
        service.run(request_id="app_mock")

    assert len(messages.calls) == 1
