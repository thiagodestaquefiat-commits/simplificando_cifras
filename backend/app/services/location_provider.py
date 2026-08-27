from __future__ import annotations

import json
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class LocationProviderError(Exception):
    """Falha controlada na comunicação com o provedor de geolocalização."""


class _TtlCache:
    def __init__(self, ttl_seconds: int, maximum: int = 200):
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.maximum = maximum
        self.values: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            value = self.values.get(key)
            if value is None or value[0] <= time.monotonic():
                self.values.pop(key, None)
                return None
            self.values.move_to_end(key)
            return value[1]

    def set(self, key: str, value) -> None:
        with self.lock:
            self.values[key] = (time.monotonic() + self.ttl_seconds, value)
            self.values.move_to_end(key)
            while len(self.values) > self.maximum:
                self.values.popitem(last=False)


@dataclass(frozen=True)
class MapImage:
    body: bytes
    content_type: str


class GeoapifyLocationProvider:
    AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete"
    STATIC_MAP_URL = "https://maps.geoapify.com/v1/staticmap"

    def __init__(self, api_key: str, timeout_seconds: float = 6, cache_ttl_seconds: int = 600):
        self.api_key = str(api_key or "").strip()
        self.timeout_seconds = max(1.0, float(timeout_seconds))
        self.search_cache = _TtlCache(cache_ttl_seconds)
        self.map_cache = _TtlCache(max(cache_ttl_seconds, 86400), maximum=80)

    def _require_key(self) -> None:
        if not self.api_key:
            raise LocationProviderError("A busca de endereços ainda não foi configurada no servidor.")

    def _download(self, url: str) -> tuple[bytes, str]:
        self._require_key()
        request = Request(url, headers={"Accept": "application/json,image/png,image/jpeg", "User-Agent": "SimplificandoCifras/1.0"})
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return response.read(), response.headers.get_content_type()
        except HTTPError as error:
            if error.code in (401, 403):
                raise LocationProviderError("A credencial do serviço de endereços foi recusada.") from error
            if error.code == 429:
                raise LocationProviderError("O limite temporário da busca de endereços foi atingido.") from error
            raise LocationProviderError("O serviço de endereços não respondeu corretamente.") from error
        except (URLError, TimeoutError, OSError) as error:
            raise LocationProviderError("O serviço de endereços está temporariamente indisponível.") from error

    def search(self, query: str, limit: int = 5) -> list[dict]:
        normalized_query = " ".join(str(query).split())
        cache_key = normalized_query.casefold()
        cached = self.search_cache.get(cache_key)
        if cached is not None:
            return cached
        parameters = urlencode({
            "text": normalized_query,
            "format": "json",
            "lang": "pt",
            "limit": min(max(int(limit), 1), 5),
            "filter": "countrycode:br",
            "bias": "countrycode:br",
            "apiKey": self.api_key,
        })
        body, _content_type = self._download(f"{self.AUTOCOMPLETE_URL}?{parameters}")
        try:
            raw_results = json.loads(body.decode("utf-8")).get("results", [])
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError) as error:
            raise LocationProviderError("O serviço de endereços retornou dados inválidos.") from error
        results: list[dict] = []
        seen: set[str] = set()
        for raw in raw_results:
            if not isinstance(raw, dict):
                continue
            try:
                latitude, longitude = float(raw["lat"]), float(raw["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            formatted = str(raw.get("formatted") or "").strip()
            place_id = str(raw.get("place_id") or "").strip()
            identity = place_id or f"{formatted}|{latitude:.6f}|{longitude:.6f}"
            if not formatted or identity in seen:
                continue
            seen.add(identity)
            results.append({
                "placeId": place_id,
                "name": str(raw.get("name") or raw.get("address_line1") or "").strip(),
                "formattedAddress": formatted,
                "street": str(raw.get("street") or "").strip(),
                "streetNumber": str(raw.get("housenumber") or "").strip(),
                "district": str(raw.get("suburb") or raw.get("district") or "").strip(),
                "city": str(raw.get("city") or raw.get("municipality") or raw.get("county") or "").strip(),
                "state": str(raw.get("state") or "").strip(),
                "postalCode": str(raw.get("postcode") or "").strip(),
                "country": str(raw.get("country") or "Brasil").strip(),
                "latitude": latitude,
                "longitude": longitude,
                "provider": "geoapify",
            })
        self.search_cache.set(cache_key, results)
        return results

    def map_image(self, latitude: float, longitude: float, width: int, height: int) -> MapImage:
        width = min(max(int(width), 320), 1200)
        height = min(max(int(height), 180), 600)
        cache_key = f"{latitude:.6f}:{longitude:.6f}:{width}:{height}"
        cached = self.map_cache.get(cache_key)
        if cached is not None:
            return cached
        parameters = urlencode({
            "style": "osm-bright",
            "width": width,
            "height": height,
            "center": f"lonlat:{longitude},{latitude}",
            "zoom": 16,
            "marker": f"lonlat:{longitude},{latitude};type:circle;color:#22c55e;size:medium",
            "apiKey": self.api_key,
        })
        body, content_type = self._download(f"{self.STATIC_MAP_URL}?{parameters}")
        if not content_type.startswith("image/"):
            raise LocationProviderError("O serviço de mapas retornou um formato inválido.")
        result = MapImage(body=body, content_type=content_type)
        self.map_cache.set(cache_key, result)
        return result
