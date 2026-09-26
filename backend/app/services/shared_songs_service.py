from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from types import SimpleNamespace
from difflib import SequenceMatcher

from pydantic import ValidationError
from sqlalchemy import text

from ..database import db
from ..models import PersonalSong, SharedSong
from ..schemas.resumo_harmonico import ResumoHarmonicoResponse, SecaoCifraCompleta
from .harmonic_normalizer import render_full_chord_sheet

MAX_CANDIDATES = 10
# Qualquer música gerada por IA entra no catálogo — o resumo compartilhado
# contém apenas acordes (sem letra nem cifra completa), então não há problema
# de privacidade independentemente da fonte (upload, texto, online ou manual).
SHAREABLE_SOURCE_TYPES = {"manual", "online", "upload", "text", "ai_knowledge"}


def canonical_section(value) -> str | None:
    """Mapeia rótulos livres (\"refrao 2\", \"Introdução\") para os nomes de seção aceitos pela IA."""
    key = normalize_text(value)
    aliases = (("pre refrao", "Pré-Refrão"), ("intro", "Intro"), ("verso", "Verso"), ("estrofe", "Verso"), ("refrao", "Refrão"),
               ("ponte", "Ponte"), ("interludio", "Interlúdio"), ("solo", "Solo"), ("final", "Final"), ("outro", "Final"))
    return next((name for prefix, name in aliases if key.startswith(prefix)), None)


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
            summary = cls._personal_response(data)
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
        # Fallback LIKE para PostgreSQL e SQLite (sem índice FULLTEXT).
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
    def _full_sheet_sections(song_data: dict) -> list[dict]:
        """Seções no formato fullChordSheet; cai para as seções do editor quando a música não tem cifra completa."""
        sheet = song_data.get("fullChordSheet")
        if isinstance(sheet, dict) and isinstance(sheet.get("sections"), list) and sheet["sections"]:
            return sheet["sections"]
        sections = song_data.get("sections")
        if not isinstance(sections, list):
            sections = (song_data.get("editorData") or {}).get("sections")
        result = []
        for section in sections if isinstance(sections, list) else []:
            if not isinstance(section, dict):
                continue
            result.append({
                "nome": None if section.get("hideLabel") else section.get("label"),
                "linhas": [{
                    "letra": str((line or {}).get("lyrics") or ""),
                    "acordes": [{"acorde": item.get("chord"), "posicao": item.get("position") or 0}
                                for item in (line or {}).get("chords") or [] if isinstance(item, dict) and item.get("chord")],
                } for line in section.get("lines") or []],
            })
        return result

    @classmethod
    def _personal_response(cls, song_data: dict) -> dict | None:
        """Música da biblioteca do próprio usuário no mesmo formato da resposta da IA, com cifra completa."""
        try:
            sections = [SecaoCifraCompleta.model_validate(section) for section in cls._full_sheet_sections(song_data)[:80]]
        except ValidationError:
            return None
        blocos = []
        for section in sections:
            chords = [item.acorde for line in section.linhas for item in sorted(line.acordes, key=lambda chord: chord.posicao)][:64]
            if not chords:
                continue
            first_lyric = next((line.letra for line in section.linhas if line.letra.strip()), None)
            blocos.append({"acordes": chords, "repeticoes": None, "fraseGuia": first_lyric,
                           "secao": canonical_section(section.nome)})
        if not blocos:
            return None
        sheet = song_data.get("fullChordSheet") if isinstance(song_data.get("fullChordSheet"), dict) else {}
        source = sheet.get("source") if sheet.get("source") in {"user_upload", "user_text", "model_knowledge", "web_source"} else "user_text"
        content = str(sheet.get("content") or "").strip()
        if not content:
            content = render_full_chord_sheet(SimpleNamespace(sections=sections)).strip()
        capo = song_data.get("capo")
        try:
            capo = int(str(capo).strip()) if capo not in (None, "") else None
        except ValueError:
            capo = None
        try:
            response = ResumoHarmonicoResponse.model_validate({
                "titulo": str(song_data.get("title") or "").strip()[:160],
                "artista": str(song_data.get("artist") or "").strip()[:160] or None,
                "tom": str(song_data.get("key") or song_data.get("currentKey") or song_data.get("originalKey") or "").strip()[:20] or None,
                "capotraste": capo if capo is not None and 0 <= capo <= 12 else None,
                "harmonicSummary": {"blocos": blocos[:40]},
                "observacoes": ["Encontrada na sua biblioteca pessoal."],
                "confianca": "alta",
                "fullChordSheet": {"source": source, "content": content[:50000],
                                   "sections": [section.model_dump(mode="json") for section in sections]} if content else None,
            })
        except ValidationError:
            return None
        return response.model_dump(mode="json")

    @staticmethod
    def _summary_from_song(song_data: dict) -> dict | None:
        """Converte a música salva no editor em resumo harmônico com cifra completa para o catálogo compartilhado."""
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
        capo = song_data.get("capo")
        # Inclui a cifra completa (letra + acordes) no catálogo compartilhado,
        # igual ao modelo do Cifra Club: cada usuário contribui com a cifra completa.
        full_sheet = song_data.get("fullChordSheet")
        full_sheet_payload = None
        if isinstance(full_sheet, dict):
            content = str(full_sheet.get("content") or "").strip()
            source = full_sheet.get("source")
            valid_sources = {"user_upload", "user_text", "model_knowledge", "web_source"}
            if content and source in valid_sources:
                full_sheet_payload = {
                    "source": source,
                    "content": content[:50000],
                    "sections": full_sheet.get("sections") or [],
                }
        try:
            response = ResumoHarmonicoResponse.model_validate({
                "titulo": str(song_data.get("title") or "").strip()[:160],
                "artista": str(song_data.get("artist") or "").strip()[:160] or None,
                "tom": str(song_data.get("originalKey") or song_data.get("key") or "").strip()[:20] or None,
                "capotraste": capo if isinstance(capo, int) and 0 <= capo <= 12 else None,
                "harmonicSummary": {"blocos": blocos[:40]},
                "observacoes": ["Cifra do catálogo compartilhado; revise antes de usar."],
                "confianca": "media",
                "fullChordSheet": full_sheet_payload,
            })
        except ValidationError:
            return None
        return response.model_dump(mode="json")

    @classmethod
    def contribute(cls, song_data, user_id) -> SharedSong | None:
        if not isinstance(song_data, dict):
            return None
        source_type = (song_data.get("sourceInfo") or {}).get("type") or "manual"
        if source_type not in SHAREABLE_SOURCE_TYPES:
            return None
        normalized_title = normalize_text(song_data.get("title"))
        normalized_artist = normalize_text(song_data.get("artist")) or None
        if not normalized_title:
            return None
        summary = cls._summary_from_song(song_data)
        if summary is None:
            return None
        new_has_full = summary.get("fullChordSheet") is not None
        existing = SharedSong.query.filter_by(normalized_title=normalized_title, normalized_artist=normalized_artist).first()
        if existing is not None:
            # Atualiza o catálogo apenas se a nova versão é mais completa:
            # tem cifra completa e a versão existente não tem.
            existing_has_full = (existing.song_data or {}).get("fullChordSheet") is not None
            if not existing_has_full and new_has_full:
                existing.song_data = summary
                existing.song_key = summary.get("tom")
                existing.capo = str(summary["capotraste"]) if summary.get("capotraste") is not None else None
                return existing
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
