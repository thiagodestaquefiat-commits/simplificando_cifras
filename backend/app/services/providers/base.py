from __future__ import annotations

from abc import ABC, abstractmethod

from ...schemas.resumo_harmonico import ResumoHarmonicoResponse


class ProviderError(Exception):
    """Falha técnica classificada sem expor detalhes do provedor ao cliente."""

    code = "provedor_indisponivel"
    status_code = 503
    public_message = "O serviço de IA está temporariamente indisponível."


class ProviderRefusal(ProviderError):
    """O provedor recusou ou não conseguiu produzir um resultado seguro."""

    code = "resultado_nao_confiavel"
    status_code = 422
    public_message = "Não foi possível produzir um resultado confiável para esta solicitação."


class ProviderTimeout(ProviderError):
    code = "provedor_timeout"
    status_code = 504
    public_message = "A análise demorou mais que o esperado. Tente novamente."


class ProviderRateLimit(ProviderError):
    code = "provedor_rate_limit"
    status_code = 429
    public_message = "O serviço de IA está temporariamente ocupado. Tente novamente em alguns instantes."


class ProviderRequestRejected(ProviderError):
    code = "provedor_rejeitou_requisicao"
    status_code = 422
    public_message = "Não foi possível processar este arquivo. Tente outro PDF ou imagem."


class ProviderStructuredResponseError(ProviderError):
    code = "resposta_estruturada_invalida"
    status_code = 502
    public_message = "A IA não conseguiu organizar esta cifra corretamente. Tente novamente."


class ProviderInvalidResponse(ProviderError):
    code = "resposta_provedor_invalida"
    status_code = 502
    public_message = "O serviço de IA retornou uma resposta inválida. Tente novamente."


class ProviderUnavailable(ProviderError):
    pass


class ProviderUnexpectedError(ProviderError):
    code = "provedor_erro_inesperado"
    status_code = 502
    public_message = "O serviço de IA não conseguiu concluir a análise. Tente novamente."


class AiProvider(ABC):
    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, media=None, context=None) -> ResumoHarmonicoResponse:
        raise NotImplementedError
