from __future__ import annotations

import json
import logging
from time import perf_counter

import anthropic
from pydantic import ValidationError

from ..schemas.anthropic_song_analysis import AnthropicHaikuCompactAnalysis


logger = logging.getLogger(__name__)


class AnthropicHaikuPocError(Exception):
    def __init__(self, code: str, message: str, status_code: int):
        super().__init__(message)
        self.code = code
        self.public_message = message
        self.status_code = status_code


class AnthropicHaikuPocService:
    MODEL = "claude-haiku-4-5-20251001"
    MAX_TOKENS = 1200

    def __init__(self, api_key: str, *, client=None):
        self._client = client or anthropic.Anthropic(api_key=api_key, timeout=60, max_retries=0)

    def run(self, *, request_id: str = "") -> dict:
        schema = anthropic.transform_schema(AnthropicHaikuCompactAnalysis.model_json_schema())
        started = perf_counter()
        stage = "provider_request"
        try:
            response = self._client.messages.create(
                model=self.MODEL,
                max_tokens=self.MAX_TOKENS,
                thinking={"type": "disabled"},
                system=(
                    "Use somente seu conhecimento interno, sem internet, pesquisa ou ferramentas. "
                    "Não invente informações. Use null ou listas vazias quando não souber. "
                    "Não forneça letra, fontes ou explicações longas. Retorne somente o JSON compacto solicitado."
                ),
                messages=[{"role": "user", "content": "Título: Tu És Bom\nArtista: Nívea Soares"}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
            stage = "provider_response"
            stop_reason = str(getattr(response, "stop_reason", "") or "")
            usage = getattr(response, "usage", None)
            provider_request_id = str(getattr(response, "_request_id", "") or "") or None
            telemetry = {
                "model": str(getattr(response, "model", "") or self.MODEL),
                "inputTokens": int(getattr(usage, "input_tokens", 0) or 0),
                "outputTokens": int(getattr(usage, "output_tokens", 0) or 0),
                "stopReason": stop_reason or None,
                "durationMs": round((perf_counter() - started) * 1000),
                "status": "received",
                "stage": stage,
                "requestId": provider_request_id or request_id or None,
                "anthropicCalls": 1,
                "webSearches": 0,
            }
            if stop_reason == "max_tokens":
                self._log(telemetry)
                raise AnthropicHaikuPocError("haiku_resposta_truncada", "A resposta compacta foi truncada.", 502)

            stage = "structured_output"
            text = "\n".join(
                str(block.text)
                for block in (getattr(response, "content", []) or [])
                if getattr(block, "type", None) == "text" and getattr(block, "text", None)
            )
            payload = json.loads(text)
            stage = "schema_validation"
            result = AnthropicHaikuCompactAnalysis.model_validate(payload)
            telemetry.update({"status": "success", "stage": "completed"})
            self._log(telemetry)
            return {**result.model_dump(mode="json"), "usage": telemetry}
        except AnthropicHaikuPocError:
            raise
        except (json.JSONDecodeError, ValidationError) as error:
            telemetry = locals().get("telemetry", self._failure_telemetry(started, request_id, stage, error))
            telemetry.update({"status": "failure", "stage": stage, "failureType": type(error).__name__})
            self._log(telemetry)
            raise AnthropicHaikuPocError("haiku_resposta_invalida", "A resposta estruturada foi inválida.", 502) from error
        except Exception as error:
            telemetry = self._failure_telemetry(started, request_id, stage, error)
            self._log(telemetry)
            raise AnthropicHaikuPocError("haiku_falha", "A prova de conceito Haiku falhou.", 502) from error

    def _failure_telemetry(self, started: float, request_id: str, stage: str, error: Exception) -> dict:
        return {
            "model": self.MODEL,
            "inputTokens": None,
            "outputTokens": None,
            "stopReason": None,
            "durationMs": round((perf_counter() - started) * 1000),
            "status": "failure",
            "stage": stage,
            "requestId": str(getattr(error, "request_id", "") or "") or request_id or None,
            "failureType": type(error).__name__,
            "anthropicCalls": 1,
            "webSearches": 0,
        }

    @staticmethod
    def _log(telemetry: dict) -> None:
        logger.info("anthropic_haiku_poc_event=%s", json.dumps(telemetry, ensure_ascii=True, sort_keys=True))
