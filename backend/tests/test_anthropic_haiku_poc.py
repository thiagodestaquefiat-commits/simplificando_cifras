import json
from types import SimpleNamespace

from app.services.anthropic_haiku_poc import AnthropicHaikuPocService


class FakeMessages:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = {
            "song": "Tu És Bom", "artist": "Nívea Soares", "key": None, "tuning": None, "capo": None,
            "chords": [], "sections": [], "harmonic_summary": [],
            "confidence": {"overall": 0.2, "key": 0, "chords": 0, "structure": 0},
            "warnings": ["Informação não confirmada sem fonte externa."],
        }
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text=json.dumps(payload))],
            usage=SimpleNamespace(input_tokens=100, output_tokens=50),
        )


def test_haiku_poc_is_one_compact_structured_call_without_web():
    messages = FakeMessages()
    result = AnthropicHaikuPocService("test", client=SimpleNamespace(messages=messages)).run()
    assert result["usage"]["anthropicCalls"] == 1
    assert result["usage"]["webSearches"] == 0
    assert len(messages.calls) == 1
    call = messages.calls[0]
    assert call["model"] == "claude-haiku-4-5-20251001"
    assert call["max_tokens"] == 900
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert "tools" not in call
    assert "letra completa" in call["system"]
