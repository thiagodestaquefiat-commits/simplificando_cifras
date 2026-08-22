from __future__ import annotations

from openai import OpenAI

from ...schemas.resumo_harmonico import ResumoHarmonicoResponse
from .base import AiProvider, ProviderError, ProviderRefusal


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

    def generate(self, system_prompt: str, user_prompt: str, media=None) -> ResumoHarmonicoResponse:
        user_content = [{"type": "input_text", "text": user_prompt}]
        if media:
            input_type = "input_file" if media.kind == "pdf" else "input_image"
            key = "file_data" if input_type == "input_file" else "image_url"
            item = {"type": input_type, key: media.data_url}
            if input_type == "input_file":
                item["filename"] = media.filename or "cifra.pdf"
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
            raise ProviderError("Falha ao consultar o provedor de IA") from error

        parsed = getattr(response, "output_parsed", None)
        if parsed is not None:
            return parsed

        refusal = self._find_refusal(response)
        if refusal:
            raise ProviderRefusal("O provedor recusou a solicitação")
        raise ProviderError("O provedor não retornou um JSON estruturado")

    @staticmethod
    def _find_refusal(response) -> str | None:
        for output_item in getattr(response, "output", []) or []:
            for content_item in getattr(output_item, "content", []) or []:
                refusal = getattr(content_item, "refusal", None)
                if refusal:
                    return str(refusal)
        return None
