from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher

from pydantic import ValidationError
from sqlalchemy import text

from ..database import db
from ..models import PersonalSong, SharedSong
from ..schemas.resumo_harmonico import CifraCompleta, ResumoHarmonicoResponse

MAX_CANDIDATES = 10
# Só entram no catálogo resumos gerados por pesquisa (sem fonte do usuário);
# uploads e textos colados continuam privados.
SHAREABLE_SOURCE_TYPES = {"manual", "online"}


def normalize_text(value) -> str:
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char)).lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_text).split())[:255]


@dataclass(frozen=True)
class SharedSongMatch:
    song: SharedSong
    score: float


@dataclass(frozen=True)
class PersonalSongMatch:
    song: PersonalSong
    summary: dict


class SharedSongService:
    @classmethod
    def search_personal(cls, user_id, title, artist=None) -> PersonalSongMatch | None:
        """Procura na biblioteca do próprio usuário: título igual (normalizado) e, se informado, artista igual."""
        normalized_title, normalized_artist = normalize_text(title), normalize_text(artist)
        if not user_id or not normalized_title:
            return None
        songs = (PersonalSong.query.filter_by(owner_user_id=user_id, deleted_at=None)
                 .order_by(PersonalSong.updated_at.desc()).all())
        for song in songs:
            data = song.song_data if isinstance(song.song_data, dict) else {}
            if normalize_text(data.get("title")) != normalized_title:
                continue
            if normalized_artist and normalize_text(data.get("artist")) != normalized_artist:
                continue
            summary = cls._summary_from_song(data, "Encontrada na sua biblioteca.", include_full_sheet=True)
            if summary is not None:
                return PersonalSongMatch(song, summary)
        return None

    @staticmethod
    def _score(song: SharedSong, title: str, artist: str) -> float:
        title_score = SequenceMatcher(None, title, song.normalized_title).ratio()
        if not artist or not song.normalized_artist:
            return title_score
        artist_score = SequenceMatcher(None, artist, song.normalized_artist).ratio()
        return 0.75 * title_score + 0.25 * artist_score

    @staticmethod
    def _candidates(title: str, artist: str) -> list[SharedSong]:
        if db.engine.dialect.name == "mysql":
            ids = db.session.execute(
                text(
                    "SELECT id FROM shared_songs "
                    "WHERE MATCH(normalized_title, normalized_artist) AGAINST (:query IN NATURAL LANGUAGE MODE) "
                    "ORDER BY MATCH(normalized_title, normalized_artist) AGAINST (:query IN NATURAL LANGUAGE MODE) DESC "
                    "LIMIT :limit"
                ),
                {"query": f"{title} {artist}".strip(), "limit": MAX_CANDIDATES},
            ).scalars().all()
            return SharedSong.query.filter(SharedSong.id.in_(ids)).all() if ids else []
        # Fallback sem FULLTEXT (SQLite em testes/dev local).
        return SharedSong.query.filter(SharedSong.normalized_title.contains(title)).limit(MAX_CANDIDATES).all()

    @classmethod
    def search(cls, title, artist=None) -> SharedSongMatch | None:
        normalized_title, normalized_artist = normalize_text(title), normalize_text(artist)
        if not normalized_title:
            return None
        scored = [SharedSongMatch(song, cls._score(song, normalized_title, normalized_artist))
                  for song in cls._candidates(normalized_title, normalized_artist)]
        if not scored:
            return None
        best = max(scored, key=lambda match: match.score)
        best.song.times_searched = (best.song.times_searched or 0) + 1
        db.session.commit()
        return best

    @staticmethod
    def _summary_from_song(song_data: dict, observacao: str = "Resumo do catálogo compartilhado; revise antes de usar.",
                           include_full_sheet: bool = False) -> dict | None:
        """Converte a música salva do editor em resumo harmônico; cifra completa só para o próprio dono."""
        sections = song_data.get("sections")
        if not isinstance(sections, list):
            sections = (song_data.get("editorData") or {}).get("sections")
        blocos = []
        for section in sections if isinstance(sections, list) else []:
            if not isinstance(section, dict):
                continue
            label = None if section.get("hideLabel") else (str(section.get("label") or "").strip()[:80] or None)
            for line in section.get("lines") or []:
                chords = [str(item.get("chord") or "").strip() for item in (line or {}).get("chords") or [] if isinstance(item, dict)]
                chords = [chord for chord in chords if chord][:64]
                if chords:
                    blocos.append({"acordes": chords, "repeticoes": line.get("repeticoes"), "fraseGuia": None, "secao": label})
        if not blocos:
            return None
        full_sheet = None
        if include_full_sheet and isinstance(song_data.get("fullChordSheet"), dict):
            try:
                full_sheet = CifraCompleta.model_validate(song_data["fullChordSheet"]).model_dump(mode="json")
            except ValidationError:
                full_sheet = None
        capo = song_data.get("capo")
        try:
            response = ResumoHarmonicoResponse.model_validate({
                "titulo": str(song_data.get("title") or "").strip()[:160],
                "artista": str(song_data.get("artist") or "").strip()[:160] or None,
                "tom": str(song_data.get("originalKey") or song_data.get("key") or "").strip()[:20] or None,
                "capotraste": capo if isinstance(capo, int) and 0 <= capo <= 12 else None,
                "harmonicSummary": {"blocos": blocos[:40]},
                "observacoes": [observacao],
                "confianca": "media",
                "fullChordSheet": full_sheet,
            })
        except ValidationError:
            return None
        return response.model_dump(mode="json")

    @classmethod
    def contribute(cls, song_data, user_id) -> SharedSong | None:
        if not isinstance(song_data, dict) or not song_data.get("aiGenerated"):
            return None
        source_type = (song_data.get("sourceInfo") or {}).get("type") or "manual"
        if source_type not in SHAREABLE_SOURCE_TYPES:
            return None
        normalized_title = normalize_text(song_data.get("title"))
        normalized_artist = normalize_text(song_data.get("artist")) or None
        if not normalized_title:
            return None
        if SharedSong.query.filter_by(normalized_title=normalized_title, normalized_artist=normalized_artist).first():
            return None
        summary = cls._summary_from_song(song_data)
        if summary is None:
            return None
        song = SharedSong(
            id=str(uuid.uuid4()),
            title=summary["titulo"][:255],
            artist=summary["artista"],
            normalized_title=normalized_title,
            normalized_artist=normalized_artist,
            song_key=summary["tom"],
            capo=str(summary["capotraste"]) if summary["capotraste"] is not None else None,
            song_data=summary,
            contributed_by=user_id,
            times_searched=0,
        )
        db.session.add(song)
        return song
