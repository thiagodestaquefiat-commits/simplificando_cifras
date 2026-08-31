from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from urllib.parse import urlparse


@dataclass(frozen=True)
class MusicSourceResult:
    source_name: str
    source_url: str
    title: str
    artist: str | None
    content: str
    retrieved_at: datetime


class MusicSourceProvider(Protocol):
    """Contrato para uma futura fonte oficial ou licenciada de conteúdo musical."""

    name: str

    def find(self, title: str, artist: str | None = None) -> MusicSourceResult | None: ...


class AuthorizedMusicSourceRegistry:
    """Executa somente provedores explicitamente autorizados e valida seu retorno.

    O MVP não registra provedor externo. Upload e texto do próprio usuário continuam
    sendo as únicas fontes capazes de produzir letra/cifra completa.
    """

    def __init__(self, providers=(), *, allowed_hosts=(), max_content_chars: int = 50_000):
        self._providers = tuple(providers)
        self._allowed_hosts = frozenset(str(host).casefold() for host in allowed_hosts if host)
        self._max_content_chars = max_content_chars

    def find(self, title: str, artist: str | None = None) -> MusicSourceResult | None:
        for provider in self._providers:
            result = provider.find(title, artist)
            if result is None:
                continue
            parsed = urlparse(result.source_url)
            if parsed.scheme != "https" or parsed.username or parsed.password:
                continue
            if parsed.hostname is None or parsed.hostname.casefold() not in self._allowed_hosts:
                continue
            if not result.content.strip() or len(result.content) > self._max_content_chars:
                continue
            return result
        return None

