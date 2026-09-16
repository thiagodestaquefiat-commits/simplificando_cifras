import inspect
import json
from types import SimpleNamespace
from typing import Literal

import anthropic
import pytest
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class HaikuSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["intro", "verse", "pre_chorus", "chorus", "bridge", "solo", "outro", "other"]
    name: str = Field(max_length=80)
    progression: list[str] = Field(max_length=32)
    order: int = Field(ge=1, le=99)
    note: str = Field(max_length=240)
    hook: str = Field(max_length=80)
    repetitions: int | None = Field(ge=1, le=99)


class HaikuConfidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall: float = Field(ge=0, le=1)
    key: float = Field(ge=0, le=1)
    chords: float = Field(ge=0, le=1)
    structure: float = Field(ge=0, le=1)


class HaikuKnowledgeAnalysis(BaseModel):
    """Exact field shape used by the reverted one-call Haiku POC."""

    model_config = ConfigDict(extra="forbid")

    song: str = Field(min_length=1, max_length=160)
    artist: str = Field(min_length=1, max_length=160)
    key: str | None
    tuning: str | None = Field(max_length=80)
    capo: int | None = Field(ge=0, le=24)
    chords: list[str] = Field(max_length=32)
    sections: list[HaikuSection] = Field(max_length=20)
    harmonic_summary: list[str] = Field(max_length=16)
    confidence: HaikuConfidence
    warnings: list[str] = Field(max_length=12)


def _request_arguments(*, include_temperature: bool) -> dict:
    schema = anthropic.transform_schema(HaikuKnowledgeAnalysis.model_json_schema())
    arguments = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 900,
        "thinking": {"type": "disabled"},
        "system": "Use somente conhecimento interno e não invente dados.",
        "messages": [{"role": "user", "content": "Título e artista de teste"}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
    }
    if include_temperature:
        arguments["temperature"] = 0
    return arguments


def _parse_response(response) -> HaikuKnowledgeAnalysis:
    text = "\n".join(
        str(block.text)
        for block in (getattr(response, "content", []) or [])
        if getattr(block, "type", None) == "text" and getattr(block, "text", None)
    )
    return HaikuKnowledgeAnalysis.model_validate(json.loads(text))


def _valid_payload() -> dict:
    return {
        "song": "Música de teste",
        "artist": "Artista de teste",
        "key": None,
        "tuning": None,
        "capo": None,
        "chords": [],
        "sections": [],
        "harmonic_summary": [],
        "confidence": {"overall": 0.2, "key": 0, "chords": 0, "structure": 0},
        "warnings": ["Informação não confirmada sem fonte externa."],
    }


def test_deployed_sdk_rejects_historical_temperature_before_transport():
    signature = inspect.signature(anthropic.resources.messages.Messages.create)

    with pytest.raises(TypeError, match="unexpected keyword argument 'temperature'"):
        signature.bind(None, **_request_arguments(include_temperature=True))


def test_corrected_request_binds_and_transformed_schema_preserves_nullable_required_fields():
    signature = inspect.signature(anthropic.resources.messages.Messages.create)
    arguments = _request_arguments(include_temperature=False)

    signature.bind(None, **arguments)
    schema = arguments["output_config"]["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert {"song", "artist", "key", "tuning", "capo", "confidence"}.issubset(schema["required"])
    assert {item.get("type") for item in schema["properties"]["key"]["anyOf"]} == {"string", "null"}


def test_complete_structured_response_parses_with_nullable_values():
    response = SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text=json.dumps(_valid_payload()))],
        usage=SimpleNamespace(input_tokens=100, output_tokens=50),
    )

    result = _parse_response(response)

    assert result.key is None
    assert result.tuning is None
    assert result.capo is None


def test_max_tokens_truncation_would_fail_after_a_provider_response():
    response = SimpleNamespace(
        stop_reason="max_tokens",
        content=[SimpleNamespace(type="text", text='{"song":"Música de teste"')],
        usage=SimpleNamespace(input_tokens=100, output_tokens=900),
    )

    with pytest.raises(json.JSONDecodeError):
        _parse_response(response)

    assert response.stop_reason == "max_tokens"
    assert response.usage.output_tokens == 900


def test_schema_validation_failure_would_happen_after_valid_json_response():
    payload = _valid_payload()
    payload.pop("confidence")
    response = SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text=json.dumps(payload))],
        usage=SimpleNamespace(input_tokens=100, output_tokens=40),
    )

    with pytest.raises(ValidationError):
        _parse_response(response)
