from __future__ import annotations

import html
import json
import threading
import time
from collections import OrderedDict
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class YouTubeProviderError(Exception):
    """Falha controlada ao pesquisar vídeos no YouTube."""


class _TtlCache:
    def __init__(self, ttl_seconds: int, maximum: int = 300):
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.maximum = max(1, int(maximum))
        self.values: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            value = self.values.get(key)
            if value is None or value[0] <= time.monotonic():
                self.values.pop(key, None)
                return None
            self.values.move_to_end(key)
            return value[1]

    def set(self, key: str, value: list[dict]) -> None:
        with self.lock:
            self.values[key] = (time.monotonic() + self.ttl_seconds, value)
            self.values.move_to_end(key)
            while len(self.values) > self.maximum:
                self.values.popitem(last=False)


class YouTubeProvider:
    SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

    def __init__(self, api_key: str, timeout_seconds: float = 8, cache_ttl_seconds: int = 86_400):
        self.api_key = str(api_key or "").strip()
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self.search_cache = _TtlCache(cache_ttl_seconds)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _require_key(self) -> None:
        if not self.enabled:
            raise YouTubeProviderError("A busca do YouTube ainda não foi configurada no servidor.")

    def _download(self, url: str) -> dict:
        self._require_key()
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "SimplificandoCifras/1.0"})
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (400, 401, 403):
                raise YouTubeProviderError("A credencial ou a cota de busca do YouTube foi recusada.") from error
            if error.code == 429:
                raise YouTubeProviderError("O limite temporário de buscas do YouTube foi atingido.") from error
            raise YouTubeProviderError("O YouTube não respondeu corretamente.") from error
        except (URLError, TimeoutError, OSError) as error:
            raise YouTubeProviderError("O YouTube está temporariamente indisponível.") from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise YouTubeProviderError("O YouTube retornou uma resposta inválida.") from error

    def search(self, query: str, limit: int = 8) -> list[dict]:
        cleaned = " ".join(str(query or "").split())
        maximum = min(max(int(limit), 1), 10)
        cache_key = f"{cleaned.casefold()}:{maximum}"
        cached = self.search_cache.get(cache_key)
        if cached is not None:
            return cached

        parameters = urlencode({
            "part": "snippet",
            "q": cleaned,
            "type": "video",
            "maxResults": maximum,
            "videoEmbeddable": "true",
            "videoSyndicated": "true",
            "relevanceLanguage": "pt",
            "regionCode": "BR",
            "safeSearch": "moderate",
            "key": self.api_key,
        })
        payload = self._download(f"{self.SEARCH_URL}?{parameters}")
        results: list[dict] = []
        seen: set[str] = set()
        for item in payload.get("items", []):
            if not isinstance(item, dict):
                continue
            video_id = str((item.get("id") or {}).get("videoId") or "").strip()
            snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
            if not video_id or video_id in seen:
                continue
            seen.add(video_id)
            thumbnails = snippet.get("thumbnails") if isinstance(snippet.get("thumbnails"), dict) else {}
            thumbnail = next((
                str((thumbnails.get(size) or {}).get("url") or "").strip()
                for size in ("high", "medium", "default")
                if isinstance(thumbnails.get(size), dict) and (thumbnails.get(size) or {}).get("url")
            ), "https://i.ytimg.com/vi/{}/hqdefault.jpg".format(video_id))
            results.append({
                "videoId": video_id,
                "title": html.unescape(str(snippet.get("title") or "").strip()),
                "channelTitle": html.unescape(str(snippet.get("channelTitle") or "").strip()),
                "thumbnailUrl": thumbnail,
                "youtubeUrl": f"https://www.youtube.com/watch?v={video_id}",
                "publishedAt": str(snippet.get("publishedAt") or "").strip() or None,
            })
        self.search_cache.set(cache_key, results)
        return results
