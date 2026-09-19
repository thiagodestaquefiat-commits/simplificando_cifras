from __future__ import annotations

import json
from time import perf_counter

from openai import OpenAI
from pydantic import ValidationError

from ...schemas.resumo_harmonico import ResumoHarmonicoResponse
from .base import ProviderError, ProviderInvalidResponse, ProviderRequestRejected
from .openai_provider import OpenAIProvider


DEEPSEEK_BASE_URL = "https://api.deepseek.com"


class DeepSeekProvider(OpenAIProvider):
    """DeepSeek Responses API adapter using the existing safe provider contract."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float,
        max_output_tokens: int,
        client=None,
    ):
        if not api_key and client is None:
            raise ProviderError("DEEPSEEK_API_KEY não configurada")
        deepseek_client = client or OpenAI(
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            timeout=timeout_seconds,
            max_retries=1,
        )
        super().__init__(
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_seconds,
            max_output_tokens=max_output_tokens,
            client=deepseek_client,
        )

    def generate(self, system_prompt: str, user_prompt: str, media=None, context=None):
        # DeepSeek Responses supports inline images, but not PDF input items.
        # Textual PDFs have already been extracted locally and arrive without media.
        media_items = (media.items or (media,)) if media else ()
        if any(item.kind == "pdf" and item.text is None for item in media_items):
            raise ProviderRequestRejected(
                "A DeepSeek não aceita PDF escaneado diretamente; envie uma imagem ou PDF com texto."
            )
        started_at = perf_counter()
        safe_context = self._safe_context(context)
        user_content = [{"type": "input_text", "text": user_prompt}]
        for index, part in enumerate(media_items):
            if media.items:
                user_content.append({
                    "type": "input_text",
                    "text": f"Continuação da mesma música: arquivo {index + 1} de {len(media_items)}. Preserve esta ordem.",
                })
            if part.text is not None:
                user_content.append({"type": "input_text", "text": part.text})
            else:
                user_content.append({"type": "input_image", "image_url": part.data_url})

        try:
            response = self._client.responses.create(
                model=self._model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                text={"format": {"type": "json_object"}},
                max_output_tokens=self._max_output_tokens,
                reasoning={"effort": "low"},
            )
        except Exception as error:
            classified = self._classify_exception(error)
            self._log_result("failure", started_at, safe_context, classified.code, exception=error)
            raise classified from error

        output_text = getattr(response, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            error = ProviderInvalidResponse("A DeepSeek não retornou conteúdo JSON")
            self._log_result(
                "failure",
                started_at,
                safe_context,
                error.code,
                response=response,
                response_diagnostics=self._safe_response_diagnostics(response, output_text),
            )
            raise error

        try:
            parsed = ResumoHarmonicoResponse.model_validate(json.loads(output_text))
        except (json.JSONDecodeError, ValidationError) as error:
            classified = self._classify_exception(error)
            self._log_result("failure", started_at, safe_context, classified.code, exception=error, response=response)
            raise classified from error

        self._log_result("success", started_at, safe_context, "ok", response=response)
        return parsed

    @classmethod
    def _safe_response_diagnostics(cls, response, output_text) -> dict:
        output_items = list(getattr(response, "output", None) or [])
        output_item_types = [str(getattr(item, "type", "unknown"))[:40] for item in output_items[:32]]
        output_block_types = [
            str(getattr(block, "type", "unknown"))[:40]
            for item in output_items[:32]
            for block in list(getattr(item, "content", None) or [])[:32]
        ][:64]
        usage = getattr(response, "usage", None)
        output_details = getattr(usage, "output_tokens_details", None)
        error = getattr(response, "error", None)
        incomplete_details = getattr(response, "incomplete_details", None)
        return {
            "response_status": cls._safe_scalar(getattr(response, "status", None)),
            "response_error_code": cls._safe_scalar(getattr(error, "code", None)),
            "incomplete_reason": cls._safe_scalar(getattr(incomplete_details, "reason", None)),
            "output_item_types": output_item_types,
            "output_block_types": output_block_types,
            "output_text_length": len(output_text) if isinstance(output_text, str) else 0,
            "input_tokens": cls._safe_integer(getattr(usage, "input_tokens", None)),
            "output_tokens": cls._safe_integer(getattr(usage, "output_tokens", None)),
            "reasoning_tokens": cls._safe_integer(getattr(output_details, "reasoning_tokens", None)),
        }

    @staticmethod
    def _safe_scalar(value) -> str | None:
        return str(value)[:80] if value is not None else None

    @staticmethod
    def _safe_integer(value) -> int | None:
        return value if isinstance(value, int) and not isinstance(value, bool) else None
