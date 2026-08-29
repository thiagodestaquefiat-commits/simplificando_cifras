from __future__ import annotations

from abc import ABC, abstractmethod

from ...schemas.resumo_harmonico import ResumoHarmonicoResponse


class ProviderError(Exception):
    """Falha técnica ou resposta inválida do provedor."""


class ProviderRefusal(ProviderError):
    """O provedor recusou ou não conseguiu produzir um resultado seguro."""


class AiProvider(ABC):
    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, media=None) -> ResumoHarmonicoResponse:
        raise NotImplementedError
