from __future__ import annotations

import json
import logging
from time import perf_counter
from typing import Any

import anthropic
from pydantic import ValidationError

from ..schemas.anthropic_song_analysis import (
    AnthropicAnalysisSource,
    AnthropicNormalizedSongAnalysis,
)


logger = logging.getLogger(__name__)


class AnthropicExperimentError(Exception):
    def __init__(self, code: str, message: str, status_code: int):
        super().__init__(message)
        self.code = code
        self.public_message = message
        self.status_code = status_code


class AnthropicSongAnalysisService:
    WEB_SEARCH_TOOL = "web_search_20260318"
    MAX_EVIDENCE_CHARACTERS = 6000
    MAX_FINAL_SOURCES = 5

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        search_max_tokens: int,
        normalize_max_tokens: int,
        web_search_max_uses: int,
        client=None,
    ):
        if not api_key and client is None:
            raise AnthropicExperimentError(
                "anthropic_nao_configurada",
                "A análise experimental não está configurada neste ambiente.",
                503,
            )
        self._client = client or anthropic.Anthropic(
            api_key=api_key,
            timeout=timeout_seconds,
            max_retries=1,
        )
        self._model = model
        self._search_max_tokens = min(1200, max(800, search_max_tokens))
        self._normalize_max_tokens = min(1400, max(1000, normalize_max_tokens))
        # A medição real mostrou que cada busca adicional domina custo e latência.
        # Uma consulta composta ainda pode retornar várias fontes independentes.
        self._web_search_max_uses = 1

    @classmethod
    def from_config(cls, config, *, client=None):
        return cls(
            api_key=config.get("ANTHROPIC_API_KEY", ""),
            model=config.get("ANTHROPIC_MODEL", "claude-sonnet-5"),
            timeout_seconds=config.get("ANTHROPIC_TIMEOUT_SECONDS", 90),
            search_max_tokens=config.get("ANTHROPIC_SEARCH_MAX_TOKENS", 3500),
            normalize_max_tokens=config.get("ANTHROPIC_NORMALIZE_MAX_TOKENS", 2500),
            web_search_max_uses=config.get("ANTHROPIC_WEB_SEARCH_MAX_USES", 3),
            client=client,
        )

    def analyze(self, song: str, artist: str, *, request_id: str = "") -> dict[str, Any]:
        started_at = perf_counter()
        try:
            search_started_at = perf_counter()
            evidence_responses = self._search(song, artist)
            search_duration_ms = round((perf_counter() - search_started_at) * 1000)
            evidence_text = "\n".join(filter(None, (self._text(item) for item in evidence_responses)))
            sources = self._merge_sources(evidence_responses)
            web_searches = sum(self._web_search_count(item) for item in evidence_responses)
            if not evidence_text:
                raise AnthropicExperimentError(
                    "anthropic_resposta_incompleta",
                    "A pesquisa não retornou evidências suficientes para análise.",
                    502,
                )
            normalize_started_at = perf_counter()
            normalized_response = self._normalize(song, artist, evidence_text, sources)
            normalize_duration_ms = round((perf_counter() - normalize_started_at) * 1000)
            analysis = self._parse_normalized(normalized_response)
            analysis.sources = sources
            usage = self._usage(
                evidence_responses,
                normalized_response,
                web_searches,
                started_at,
                search_duration_ms=search_duration_ms,
                normalize_duration_ms=normalize_duration_ms,
                evidence_characters=len(evidence_text),
                source_count=len(sources),
            )
            self._log("success", "ok", request_id, usage)
            return {**analysis.model_dump(mode="json"), "usage": usage}
        except AnthropicExperimentError as error:
            self._log("failure", error.code, request_id, {"model": self._model})
            raise
        except Exception as error:
            classified = self._classify(error)
            self._log(
                "failure",
                classified.code,
                request_id,
                {"model": self._model, **self._provider_error_metadata(error)},
            )
            raise classified from error

    def _search(self, song: str, artist: str):
        prompt = (
            "Faça uma única consulta web composta e compacta. Compare 2 a 5 resultados úteis dessa consulta. "
            "Confirme identidade, tonalidade, afinação, "
            "capo, acordes/progressões e estrutura. Produza no máximo 900 palavras, em tópicos curtos, "
            "com pelo menos 2 citações web junto às afirmações quando houver resultados. Sinalize divergências. "
            "Não inclua letras nem transcrições. "
            f"Música: {song}\nArtista: {artist}"
        )
        response = self._client.messages.create(
            model=self._model,
            max_tokens=self._search_max_tokens,
            thinking={"type": "disabled"},
            system=(
                "Você é um pesquisador musical cuidadoso. Use Web Search para localizar fontes, compare-as "
                "e produza somente evidência musical compacta. A síntese final deve citar 2 a 5 fontes independentes; "
                "não faça pesquisa exaustiva, scraping, nem copie letras protegidas."
            ),
            messages=[{"role": "user", "content": prompt}],
            tools=[{
                "type": self.WEB_SEARCH_TOOL,
                "name": "web_search",
                "max_uses": self._web_search_max_uses,
                "response_inclusion": "excluded",
            }],
        )
        responses = [response]
        if getattr(response, "stop_reason", None) == "pause_turn":
            used = self._web_search_count(response)
            remaining = self._web_search_max_uses - used
            if remaining <= 0:
                raise AnthropicExperimentError(
                    "anthropic_pesquisa_incompleta",
                    "A pesquisa atingiu o limite antes de concluir.",
                    502,
                )
            response = self._client.messages.create(
                model=self._model,
                max_tokens=self._search_max_tokens,
                thinking={"type": "disabled"},
                system="Continue a pesquisa musical anterior e conclua apenas com evidências verificáveis.",
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": self._plain(getattr(response, "content", []))},
                ],
                tools=[{
                    "type": self.WEB_SEARCH_TOOL,
                    "name": "web_search",
                    "max_uses": remaining,
                    "response_inclusion": "excluded",
                }],
            )
            responses.append(response)
        return responses

    def _normalize(self, song: str, artist: str, evidence: str, sources: list[AnthropicAnalysisSource]):
        source_lines = "\n".join(f"- {item.title}: {item.url}" for item in sources) or "- nenhuma fonte verificável"
        output_schema = anthropic.transform_schema(AnthropicNormalizedSongAnalysis.model_json_schema())
        return self._client.messages.create(
            model=self._model,
            max_tokens=self._normalize_max_tokens,
            thinking={"type": "disabled"},
            system=(
                "Normalize evidências de pesquisa musical no schema solicitado. Use null/listas vazias e baixa "
                "confiança quando faltar evidência. Não invente URLs, acordes, tonalidade ou estrutura; não inclua letras."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Música solicitada: {song}\nArtista solicitado: {artist}\n\n"
                    f"Evidência compacta:\n{evidence[:self.MAX_EVIDENCE_CHARACTERS]}\n\nFontes citadas:\n{source_lines}\n\n"
                    "Retorne só o JSON. Limites: até 16 acordes, 12 seções, 12 itens de resumo e 8 avisos. "
                    "Notas e ganchos devem ser curtos."
                ),
            }],
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": output_schema,
                }
            },
        )

    @staticmethod
    def _parse_normalized(response) -> AnthropicNormalizedSongAnalysis:
        text = AnthropicSongAnalysisService._text(response)
        if not text:
            raise AnthropicExperimentError(
                "anthropic_resposta_incompleta",
                "A análise estruturada veio incompleta.",
                502,
            )
        try:
            return AnthropicNormalizedSongAnalysis.model_validate(json.loads(text))
        except (json.JSONDecodeError, ValidationError) as error:
            raise AnthropicExperimentError(
                "anthropic_resposta_invalida",
                "A análise estruturada retornou um formato inválido.",
                502,
            ) from error

    @staticmethod
    def _text(response) -> str:
        values = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                values.append(str(block.text))
            elif isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
                values.append(str(block["text"]))
        return "\n".join(values).strip()

    @classmethod
    def _sources(cls, response) -> list[AnthropicAnalysisSource]:
        found: dict[str, AnthropicAnalysisSource] = {}
        for block in getattr(response, "content", []) or []:
            plain = cls._plain(block)
            if not isinstance(plain, dict) or plain.get("type") != "text":
                continue
            for citation in plain.get("citations") or []:
                item = cls._plain(citation)
                if not isinstance(item, dict):
                    continue
                url = item.get("url")
                if isinstance(url, str) and url.startswith(("https://", "http://")):
                    title = str(item.get("title") or url)[:300].strip()
                    found.setdefault(url, AnthropicAnalysisSource(url=url[:2000], title=title))
        return list(found.values())[: cls.MAX_FINAL_SOURCES]

    @classmethod
    def _merge_sources(cls, responses) -> list[AnthropicAnalysisSource]:
        found: dict[str, AnthropicAnalysisSource] = {}
        for response in responses:
            for source in cls._sources(response):
                found.setdefault(source.url, source)
        return list(found.values())[: cls.MAX_FINAL_SOURCES]

    @staticmethod
    def _plain(value):
        if hasattr(value, "model_dump"):
            return value.model_dump(mode="json")
        if isinstance(value, tuple):
            return [AnthropicSongAnalysisService._plain(item) for item in value]
        if isinstance(value, list):
            return [AnthropicSongAnalysisService._plain(item) for item in value]
        if isinstance(value, dict):
            return {key: AnthropicSongAnalysisService._plain(item) for key, item in value.items()}
        return value

    @staticmethod
    def _web_search_count(response) -> int:
        usage = getattr(response, "usage", None)
        server = getattr(usage, "server_tool_use", None)
        if isinstance(server, dict):
            return int(server.get("web_search_requests") or 0)
        return int(getattr(server, "web_search_requests", 0) or 0)

    def _usage(
        self,
        search_responses,
        second,
        web_searches: int,
        started_at: float,
        *,
        search_duration_ms: int,
        normalize_duration_ms: int,
        evidence_characters: int,
        source_count: int,
    ) -> dict[str, Any]:
        search_input_tokens = sum(self._tokens(item, "input_tokens") for item in search_responses)
        search_output_tokens = sum(self._tokens(item, "output_tokens") for item in search_responses)
        normalize_input_tokens = self._tokens(second, "input_tokens")
        normalize_output_tokens = self._tokens(second, "output_tokens")
        return {
            "model": self._model,
            "inputTokens": search_input_tokens + normalize_input_tokens,
            "outputTokens": search_output_tokens + normalize_output_tokens,
            "webSearches": web_searches,
            "durationMs": round((perf_counter() - started_at) * 1000),
            "stages": {
                "search": {
                    "durationMs": search_duration_ms,
                    "inputTokens": search_input_tokens,
                    "outputTokens": search_output_tokens,
                    "webSearches": web_searches,
                    "sources": source_count,
                    "evidenceCharacters": evidence_characters,
                },
                "normalization": {
                    "durationMs": normalize_duration_ms,
                    "inputTokens": normalize_input_tokens,
                    "outputTokens": normalize_output_tokens,
                    "evidenceCharacters": evidence_characters,
                },
            },
        }

    @staticmethod
    def _tokens(response, name: str) -> int:
        usage = getattr(response, "usage", None)
        return int(getattr(usage, name, 0) or 0)

    @staticmethod
    def _classify(error: Exception) -> AnthropicExperimentError:
        if isinstance(error, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
            return AnthropicExperimentError("anthropic_autenticacao", "O provedor experimental recusou a autenticação.", 503)
        if isinstance(error, anthropic.RateLimitError):
            return AnthropicExperimentError("anthropic_limite", "O provedor experimental está temporariamente ocupado.", 429)
        if isinstance(error, anthropic.APITimeoutError):
            return AnthropicExperimentError("anthropic_timeout", "A pesquisa experimental excedeu o tempo limite.", 504)
        if isinstance(error, anthropic.APIConnectionError):
            return AnthropicExperimentError("anthropic_indisponivel", "O provedor experimental está indisponível.", 503)
        if isinstance(error, anthropic.BadRequestError):
            return AnthropicSongAnalysisService._classify_bad_request(error)
        if isinstance(error, anthropic.APIStatusError):
            if error.status_code == 429:
                return AnthropicExperimentError("anthropic_limite", "O provedor experimental está temporariamente ocupado.", 429)
            if error.status_code in {401, 402, 403}:
                return AnthropicExperimentError("anthropic_acesso_indisponivel", "O acesso ao provedor experimental não está disponível.", 503)
            if error.status_code >= 500:
                return AnthropicExperimentError("anthropic_indisponivel", "O provedor experimental está indisponível.", 503)
        return AnthropicExperimentError("anthropic_erro", "A análise experimental não pôde ser concluída.", 502)

    @staticmethod
    def _classify_bad_request(error) -> AnthropicExperimentError:
        body = getattr(error, "body", None)
        safe_text = json.dumps(body, ensure_ascii=True, sort_keys=True).lower() if isinstance(body, dict) else ""
        mentions_web_search = "web search" in safe_text or "web_search" in safe_text
        if mentions_web_search and any(word in safe_text for word in ("disabled", "not enabled")):
            return AnthropicExperimentError(
                "anthropic_web_search_desabilitada",
                "A Web Search não está habilitada para a conta Anthropic deste ambiente.",
                503,
            )
        if mentions_web_search and any(
            word in safe_text for word in ("unavailable", "not available", "unsupported", "not supported", "invalid")
        ):
            return AnthropicExperimentError(
                "anthropic_web_search_indisponivel",
                "A Web Search não está disponível com a configuração atual do provedor.",
                503,
            )
        if any(word in safe_text for word in ("credit balance", "billing", "insufficient credit")):
            return AnthropicExperimentError(
                "anthropic_creditos_indisponiveis",
                "A conta Anthropic não possui créditos disponíveis para esta análise.",
                503,
            )
        if "model" in safe_text and any(word in safe_text for word in ("not found", "not available", "unsupported")):
            return AnthropicExperimentError(
                "anthropic_modelo_indisponivel",
                "O modelo Anthropic configurado não está disponível para esta conta.",
                503,
            )
        return AnthropicExperimentError(
            "anthropic_requisicao_invalida",
            "O provedor experimental rejeitou a configuração da análise.",
            502,
        )

    @staticmethod
    def _provider_error_metadata(error) -> dict[str, Any]:
        body = getattr(error, "body", None)
        provider_type = None
        if isinstance(body, dict):
            nested = body.get("error") if isinstance(body.get("error"), dict) else body
            provider_type = nested.get("type") or nested.get("code")
        return {
            "providerStatus": getattr(error, "status_code", None),
            "providerRequestId": str(getattr(error, "request_id", "") or "") or None,
            "providerErrorType": str(provider_type)[:80] if provider_type else None,
            "providerRejectedField": AnthropicSongAnalysisService._provider_rejected_field(body),
        }

    @staticmethod
    def _provider_rejected_field(body) -> str | None:
        if not isinstance(body, dict):
            return None
        safe_text = json.dumps(body, ensure_ascii=True, sort_keys=True).lower()
        fields = (
            ("web_search", ("web search", "web_search")),
            ("output_config", ("output_config", "json_schema")),
            ("max_tokens", ("max_tokens",)),
            ("thinking", ("thinking",)),
            ("model", ("model",)),
            ("tools", ("tool",)),
            ("messages", ("message",)),
        )
        for label, markers in fields:
            if any(marker in safe_text for marker in markers):
                return label
        return None

    def _log(self, outcome: str, code: str, request_id: str, usage: dict[str, Any]) -> None:
        event = {
            "event": "anthropic_song_analysis",
            "outcome": outcome,
            "code": code,
            "request_id": request_id,
            "model": usage.get("model", self._model),
            "input_tokens": usage.get("inputTokens"),
            "output_tokens": usage.get("outputTokens"),
            "web_searches": usage.get("webSearches"),
            "duration_ms": usage.get("durationMs"),
            "provider_status": usage.get("providerStatus"),
            "provider_request_id": usage.get("providerRequestId"),
            "provider_error_type": usage.get("providerErrorType"),
            "provider_rejected_field": usage.get("providerRejectedField"),
        }
        log = logger.info if outcome == "success" else logger.warning
        log("anthropic_experiment_event=%s", json.dumps(event, ensure_ascii=True, sort_keys=True))
