from __future__ import annotations

from openai import OpenAI

from .base import ProviderError, ProviderRequestRejected
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
        return super().generate(system_prompt, user_prompt, media, context)
