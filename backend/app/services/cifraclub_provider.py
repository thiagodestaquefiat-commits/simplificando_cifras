"""Adapter connecting the existing Cifra Club acquisition path to song discovery."""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher

from .music_sources import (
    MusicSourceCandidate, MusicSourceInvalid, MusicSourceResult,
    MusicSourceUnavailable, SafeMusicSourceHttpClient,
)
from . import web_search


class CifraClubMusicSourceProvider:
    provider_id = "cifraclub"
    source_name = "Cifra Club"
    allowed_hosts = web_search.CIFRACLUB_HOSTS

    def __init__(self, *, scraper_api_key="", http_client=None, search_documents=None):
        self.client = http_client or (
            web_search.ScraperApiHttpClient(scraper_api_key)
            if scraper_api_key else SafeMusicSourceHttpClient()
        )
        self.search_documents = search_documents or web_search.cifraclub_search_documents

    @staticmethod
    def _source_id(artist, song):
        if not all(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,199}", str(part or "")) for part in (artist, song)):
            raise MusicSourceInvalid("Identidade da música inválida")
        return f"{artist}/{song}"

    def search(self, title, artist=None):
        docs = self.search_documents(title, artist, self.client)
        if docs is None:
            raise MusicSourceUnavailable("A pesquisa musical não respondeu")
        query = web_search.slugify(title)
        matches = []
        seen = set()
        for doc in docs:
            if not isinstance(doc, dict) or str(doc.get("tipo", "2")) != "2":
                continue
            try:
                source_id = self._source_id(doc.get("dns"), doc.get("url"))
            except MusicSourceInvalid:
                continue
            name, performer = str(doc.get("txt") or "").strip(), str(doc.get("art") or "").strip()
            if not name or not performer or source_id in seen:
                continue
            song = web_search.slugify(name)
            artist_slug = web_search.slugify(performer)
            if artist and SequenceMatcher(None, web_search.slugify(artist), artist_slug).ratio() < .5:
                continue
            if not (query in song or web_search._title_matches_without_artist(doc, query)
                    or SequenceMatcher(None, query, song).ratio() >= .6):
                continue
            seen.add(source_id)
            matches.append(MusicSourceCandidate(
                self.provider_id, source_id, self.source_name,
                f"https://www.cifraclub.com.br/{source_id}/", name, performer, "lyrics_chords",
            ))
            if len(matches) >= 8:
                break
        return matches

    def fetch(self, source_id):
        parts = str(source_id or "").split("/")
        if len(parts) != 2 or self._source_id(*parts) != source_id:
            raise MusicSourceInvalid("Identidade da música inválida")
        url = f"https://www.cifraclub.com.br/{source_id}/"
        content, _metadata, resolved = web_search._fetch_cifraclub(
            url, self.client, deadline=time.monotonic() + web_search.WEB_SEARCH_BUDGET_SECONDS,
        )
        if not content:
            raise MusicSourceUnavailable("Não foi possível carregar a cifra selecionada")
        # Stable source identity is retained even if the existing reader uses a simplified sheet.
        return MusicSourceResult(
            self.provider_id, source_id, self.source_name, resolved,
            parts[1].replace("-", " "), parts[0].replace("-", " "), content,
            "lyrics_chords", datetime.now(timezone.utc),
        )
