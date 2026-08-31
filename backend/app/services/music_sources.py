from __future__ import annotations

import ipaddress
import re
import socket
import unicodedata
from dataclasses import dataclass, replace
from datetime import datetime
from difflib import SequenceMatcher
from typing import Protocol
from urllib.parse import urljoin, urlparse

import httpx


class MusicSourceError(Exception):
    pass


class MusicSourceTimeout(MusicSourceError):
    pass


class MusicSourceUnavailable(MusicSourceError):
    pass


class MusicSourceInvalid(MusicSourceError):
    pass


@dataclass(frozen=True)
class MusicSourceCandidate:
    provider_id: str
    source_id: str
    source_name: str
    source_url: str
    title: str
    artist: str | None
    format: str
    score: float = 0.0


@dataclass(frozen=True)
class MusicSourceResult:
    provider_id: str
    source_id: str
    source_name: str
    source_url: str
    title: str
    artist: str | None
    content: str
    format: str
    retrieved_at: datetime


class MusicSourceProvider(Protocol):
    """Contrato para fontes oficiais ou licenciadas configuradas no backend."""

    provider_id: str
    source_name: str
    allowed_hosts: tuple[str, ...]

    def search(self, title: str, artist: str | None = None) -> list[MusicSourceCandidate]: ...

    def fetch(self, source_id: str) -> MusicSourceResult: ...


def _identity(value: str | None) -> str:
    folded = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", folded.casefold()).strip()


def _score(query_title: str, query_artist: str | None, candidate: MusicSourceCandidate) -> float:
    title_score = SequenceMatcher(None, _identity(query_title), _identity(candidate.title)).ratio()
    if title_score < 0.6:
        return 0.0
    if query_artist:
        artist_score = SequenceMatcher(None, _identity(query_artist), _identity(candidate.artist)).ratio()
        if artist_score < 0.5:
            return 0.0
        return round((title_score * 0.72) + (artist_score * 0.28), 4)
    return round(title_score, 4)


def _public_ip(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return not (address.is_private or address.is_loopback or address.is_link_local or address.is_multicast or address.is_reserved or address.is_unspecified)


def validate_external_url(url: str, allowed_hosts: tuple[str, ...], resolver=socket.getaddrinfo) -> str:
    parsed = urlparse(str(url or ""))
    host = (parsed.hostname or "").casefold()
    hosts = {item.casefold() for item in allowed_hosts}
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or host not in hosts or host == "localhost":
        raise MusicSourceInvalid("URL da fonte não autorizada")
    try:
        addresses = {item[4][0] for item in resolver(host, 443, type=socket.SOCK_STREAM)}
    except OSError as error:
        raise MusicSourceUnavailable("Não foi possível resolver a fonte") from error
    if not addresses or any(not _public_ip(address) for address in addresses):
        raise MusicSourceInvalid("Endereço privado ou reservado bloqueado")
    return parsed.geturl()


class SafeMusicSourceHttpClient:
    """Cliente comum para futuros providers, com SSRF e download limitados."""

    def __init__(self, *, timeout_seconds=8, max_bytes=1_000_000, max_redirects=2, client=None):
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
        self._client = client or httpx.Client(timeout=timeout_seconds, follow_redirects=False)

    def get_text(self, url: str, *, allowed_hosts: tuple[str, ...], allowed_content_types=("text/plain", "application/json")) -> tuple[str, str]:
        current = url
        for redirect_count in range(self.max_redirects + 1):
            validate_external_url(current, allowed_hosts)
            try:
                response = self._client.get(current, headers={"Accept": ", ".join(allowed_content_types)})
            except httpx.TimeoutException as error:
                raise MusicSourceTimeout("Tempo esgotado ao consultar a fonte") from error
            except httpx.HTTPError as error:
                raise MusicSourceUnavailable("Fonte temporariamente indisponível") from error
            if response.status_code in {301, 302, 303, 307, 308}:
                if redirect_count >= self.max_redirects or not response.headers.get("location"):
                    raise MusicSourceInvalid("Redirecionamentos excedidos")
                current = urljoin(current, response.headers["location"])
                continue
            if response.status_code != 200:
                raise MusicSourceUnavailable("Fonte retornou status inesperado")
            content_type = response.headers.get("content-type", "").split(";", 1)[0].casefold()
            if content_type not in {item.casefold() for item in allowed_content_types}:
                raise MusicSourceInvalid("Content-Type da fonte não permitido")
            content = response.content
            if len(content) > self.max_bytes:
                raise MusicSourceInvalid("Conteúdo da fonte excede o limite")
            try:
                return content.decode(response.encoding or "utf-8"), current
            except UnicodeDecodeError as error:
                raise MusicSourceInvalid("Conteúdo da fonte não é texto válido") from error
        raise MusicSourceInvalid("Redirecionamentos excedidos")


class AuthorizedMusicSourceRegistry:
    def __init__(self, providers=(), *, min_score: float = 0.62, max_results: int = 8, max_content_chars: int = 50_000, url_validator=validate_external_url):
        self._providers = {provider.provider_id: provider for provider in providers}
        self._min_score = min_score
        self._max_results = max_results
        self._max_content_chars = max_content_chars
        self._url_validator = url_validator

    def search(self, title: str, artist: str | None = None) -> list[MusicSourceCandidate]:
        matches: list[MusicSourceCandidate] = []
        failures: list[MusicSourceError] = []
        for provider in self._providers.values():
            try:
                candidates = provider.search(title, artist)
            except (MusicSourceTimeout, MusicSourceUnavailable) as error:
                failures.append(error)
                continue
            for candidate in candidates:
                if candidate.provider_id != provider.provider_id:
                    continue
                try:
                    self._url_validator(candidate.source_url, provider.allowed_hosts)
                except MusicSourceError:
                    continue
                scored = replace(candidate, score=_score(title, artist, candidate))
                if scored.score >= self._min_score:
                    matches.append(scored)
        if not matches and failures:
            if any(isinstance(error, MusicSourceTimeout) for error in failures):
                raise MusicSourceTimeout("As fontes configuradas demoraram para responder")
            raise MusicSourceUnavailable("As fontes configuradas estão indisponíveis")
        unique = {(item.provider_id, item.source_id): item for item in matches}
        return sorted(unique.values(), key=lambda item: (-item.score, item.source_name, item.title))[: self._max_results]

    def fetch(self, provider_id: str, source_id: str) -> MusicSourceResult:
        provider = self._providers.get(provider_id)
        if provider is None:
            raise MusicSourceInvalid("Provider não configurado")
        result = provider.fetch(source_id)
        if result.provider_id != provider_id or result.source_id != source_id:
            raise MusicSourceInvalid("Identidade da fonte inválida")
        self._url_validator(result.source_url, provider.allowed_hosts)
        content = result.content.strip()
        if not content or len(content) > self._max_content_chars:
            raise MusicSourceInvalid("Conteúdo musical vazio ou acima do limite")
        if result.format not in {"chordpro", "text", "lyrics_chords"}:
            raise MusicSourceInvalid("Formato musical não suportado")
        return replace(result, content=content)
