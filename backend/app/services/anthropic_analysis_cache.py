from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
from threading import RLock
from time import monotonic
import unicodedata


class AnthropicAnalysisCache:
    """Small process-local cache for the isolated preview experiment.

    Keys are hashed and include the analyzer version. Only the normalized final
    analysis is retained; raw search pages and evidence are never cached.
    """

    def __init__(self, *, ttl_seconds: int, max_entries: int, analyzer_version: str):
        self._ttl_seconds = max(1, int(ttl_seconds))
        self._max_entries = max(1, int(max_entries))
        self._analyzer_version = str(analyzer_version or "v1")
        self._items: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = RLock()

    @staticmethod
    def _normalize(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", str(value or ""))
        plain = "".join(char for char in normalized if not unicodedata.combining(char))
        return " ".join(plain.casefold().split())

    def key(self, song: str, artist: str) -> str:
        identity = "\x1f".join((self._analyzer_version, self._normalize(artist), self._normalize(song)))
        return sha256(identity.encode("utf-8")).hexdigest()

    def get(self, song: str, artist: str) -> dict | None:
        key = self.key(song, artist)
        now = monotonic()
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return deepcopy(value)

    def set(self, song: str, artist: str, value: dict) -> None:
        key = self.key(song, artist)
        with self._lock:
            self._items[key] = (monotonic() + self._ttl_seconds, deepcopy(value))
            self._items.move_to_end(key)
            while len(self._items) > self._max_entries:
                self._items.popitem(last=False)

