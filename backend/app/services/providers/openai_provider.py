from __future__ import annotations

import json
import logging
from time import perf_counter

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    BadRequestError,
    OpenAI,
    RateLimitError,
)
from pydantic import ValidationError

from ...schemas.resumo_harmonico import ResumoHarmonicoResponse
from .base import (
    AiProvider,
    ProviderError,
    ProviderInvalidResponse,
    ProviderRateLimit,
    ProviderRefusal,
    ProviderRequestRejected,
    ProviderStructuredResponseError,
    ProviderTimeout,
    ProviderUnavailable,
    ProviderUnexpectedError,
)


logger = logging.getLogger(__name__)


class OpenAIProvider(AiProvider):
    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float,
        max_output_tokens: int,
        client=None,
    ):
        if not api_key and client is None:
            raise ProviderError("OPENAI_API_KEY não configurada")
        self._client = client or OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=1)
        self._model = model
        self._max_output_tokens = max_output_tokens

    def generate(self, system_prompt: str, user_prompt: str, media=None, context=None) -> ResumoHarmonicoResponse:
        started_at = perf_counter()
        safe_context = self._safe_context(context)
        user_content = [{"type": "input_text", "text": user_prompt}]
        media_items = (media.items or (media,)) if media else ()
        for index, part in enumerate(media_items):
            if media.items:
                user_content.append({"type": "input_text", "text": f"Continuação da mesma música: arquivo {index + 1} de {len(media_items)}. Preserve esta ordem."})
            if part.text is not None:
                user_content.append({"type": "input_text", "text": part.text})
                continue
            input_type = "input_file" if part.kind == "pdf" else "input_image"
            key = "file_data" if input_type == "input_file" else "image_url"
            item = {"type": input_type, key: part.data_url}
            if input_type == "input_file":
                item["filename"] = part.filename or "cifra.pdf"
            user_content.append(item)
        try:
            response = self._client.responses.parse(
                model=self._model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                text_format=ResumoHarmonicoResponse,
                max_output_tokens=self._max_output_tokens,
                reasoning={"effort": "low"},
            )
        except Exception as error:
            classified = self._classify_exception(error)
            self._log_result(
                "failure",
                started_at,
                safe_context,
                classified.code,
                exception=error,
            )
            raise classified from error

        parsed = getattr(response, "output_parsed", None)
        if parsed is not None:
            self._log_result("success", started_at, safe_context, "ok", response=response)
            return parsed

        refusal = self._find_refusal(response)
        if refusal:
            error = ProviderRefusal("O provedor recusou a solicitação")
            self._log_result("failure", started_at, safe_context, error.code, response=response)
            raise error
        error = ProviderInvalidResponse("O provedor não retornou um JSON estruturado")
        self._log_result("failure", started_at, safe_context, error.code, response=response)
        raise error

    @staticmethod
    def _classify_exception(error: Exception) -> ProviderError:
        exception_name = error.__class__.__name__
        if exception_name == "ContentFilterFinishReasonError":
            return ProviderRefusal("O provedor recusou a solicitação")
        if exception_name in {"LengthFinishReasonError", "APIResponseValidationError"}:
            return ProviderStructuredResponseError("Structured Output incompleto ou inválido")
        if isinstance(error, APITimeoutError):
            return ProviderTimeout("Timeout do provedor")
        if isinstance(error, RateLimitError):
            return ProviderRateLimit("Rate limit do provedor")
        if isinstance(error, BadRequestError):
            return ProviderRequestRejected("Requisição rejeitada pelo provedor")
        if isinstance(error, (ValidationError, json.JSONDecodeError)):
            return ProviderStructuredResponseError("Falha ao interpretar Structured Output")
        if isinstance(error, APIConnectionError):
            return ProviderUnavailable("Falha de conexão com o provedor")
        if isinstance(error, APIStatusError):
            if error.status_code == 429:
                return ProviderRateLimit("Rate limit do provedor")
            if error.status_code >= 500:
                return ProviderUnavailable("Indisponibilidade do provedor")
            return ProviderRequestRejected("Erro HTTP do provedor")
        return ProviderUnexpectedError("Erro inesperado do provedor")

    @staticmethod
    def _safe_context(context) -> dict:
        values = context if isinstance(context, dict) else {}
        return {
            "internal_request_id": str(values.get("request_id") or ""),
            "input_type": values.get("input_type"),
            "classification": values.get("classification"),
            "media_type": values.get("media_type"),
            "page_count": values.get("page_count"),
            "size_bytes": values.get("size_bytes"),
        }

    @classmethod
    def _log_result(
        cls,
        outcome: str,
        started_at: float,
        safe_context: dict,
        code: str,
        *,
        exception: Exception | None = None,
        response=None,
    ) -> None:
        provider_request_id = cls._provider_request_id(exception, response)
        status_code = getattr(exception, "status_code", None)
        event = {
            "event": "ai_provider_call",
            "outcome": outcome,
            "code": code,
            "duration_ms": round((perf_counter() - started_at) * 1000),
            "exception_class": exception.__class__.__name__ if exception else None,
            "provider_status": status_code,
            "provider_request_id": provider_request_id,
            **safe_context,
        }
        log = logger.info if outcome == "success" else logger.error
        log("ai_provider_event=%s", json.dumps(event, ensure_ascii=True, sort_keys=True))

    @staticmethod
    def _provider_request_id(exception=None, response=None) -> str | None:
        request_id = getattr(exception, "request_id", None)
        if request_id:
            return str(request_id)
        request_id = getattr(response, "_request_id", None)
        return str(request_id) if request_id else None

    @staticmethod
    def _find_refusal(response) -> str | None:
        for output_item in getattr(response, "output", []) or []:
            for content_item in getattr(output_item, "content", []) or []:
                refusal = getattr(content_item, "refusal", None)
                if refusal:
                    return str(refusal)
        return None
