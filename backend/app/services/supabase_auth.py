from __future__ import annotations

import json
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class SupabaseAuthError(Exception):
    pass


class SupabaseAuthProvider:
    """Valida o token diretamente no Auth, sem armazenar senha ou service_role."""

    def __init__(self, url: str, anon_key: str, timeout_seconds: float = 6):
        self.url = str(url or "").rstrip("/")
        self.anon_key = str(anon_key or "").strip()
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self._cache: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self.url and self.anon_key)

    def validate(self, access_token: str) -> dict:
        if not self.enabled:
            raise SupabaseAuthError("O login externo ainda não foi configurado.")
        token = str(access_token or "").strip()
        with self._lock:
            cached = self._cache.get(token)
            if cached and cached[0] > time.monotonic():
                return cached[1]
        request = Request(
            f"{self.url}/auth/v1/user",
            headers={"apikey": self.anon_key, "Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (401, 403):
                raise SupabaseAuthError("A sessão expirou ou não é válida.") from error
            raise SupabaseAuthError("Não foi possível validar a sessão agora.") from error
        except (URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise SupabaseAuthError("O serviço de autenticação está temporariamente indisponível.") from error
        if not isinstance(payload, dict) or not payload.get("id"):
            raise SupabaseAuthError("O serviço de autenticação retornou um perfil inválido.")
        with self._lock:
            if len(self._cache) > 300:
                self._cache.clear()
            self._cache[token] = (time.monotonic() + 60, payload)
        return payload
