from __future__ import annotations

import json
from time import perf_counter

import anthropic

from ..schemas.anthropic_song_analysis import AnthropicHaikuKnowledgeAnalysis


class AnthropicHaikuPocService:
    MODEL = "claude-haiku-4-5-20251001"

    def __init__(self, api_key: str, *, client=None):
        self._client = client or anthropic.Anthropic(api_key=api_key, timeout=60, max_retries=0)

    def run(self) -> dict:
        schema = anthropic.transform_schema(AnthropicHaikuKnowledgeAnalysis.model_json_schema())
        started = perf_counter()
        response = self._client.messages.create(
            model=self.MODEL,
            max_tokens=900,
            thinking={"type": "disabled"},
            temperature=0,
            system=(
                "Use somente seu conhecimento interno. Não use internet nem ferramentas. Não invente dados para "
                "preencher campos. Quando não souber, use null ou lista vazia e explique brevemente em warnings. "
                "Não forneça letra completa. Retorne um JSON musical compacto no schema solicitado."
            ),
            messages=[{"role": "user", "content": "Título: Tu És Bom\nArtista: Nívea Soares"}],
            output_config={"format": {"type": "json_schema", "schema": schema}},
        )
        text = "\n".join(
            str(block.text) for block in (getattr(response, "content", []) or [])
            if getattr(block, "type", None) == "text" and getattr(block, "text", None)
        )
        result = AnthropicHaikuKnowledgeAnalysis.model_validate(json.loads(text))
        usage = getattr(response, "usage", None)
        return {
            **result.model_dump(mode="json"),
            "usage": {
                "model": self.MODEL,
                "anthropicCalls": 1,
                "webSearches": 0,
                "inputTokens": int(getattr(usage, "input_tokens", 0) or 0),
                "outputTokens": int(getattr(usage, "output_tokens", 0) or 0),
                "durationMs": round((perf_counter() - started) * 1000),
            },
        }
