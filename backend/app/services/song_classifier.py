# MANUTENÇÃO: Classificação das músicas do CATÁLOGO COMPARTILHADO para recomendações
# MANUTENÇÃO: (gênero, subgênero, andamento, BPM aproximado, temas, se é música sacra).
# MANUTENÇÃO: Uma chamada à IA por música, guardada em shared_song_profiles; nunca a cada busca.
# MANUTENÇÃO: A IA só classifica: nunca escreve nem altera letra ou cifra.
# MANUTENÇÃO: BPM da comunidade: shared_song_profiles.bpm_votes guarda o BPM que cada conta salvou (id com hash).
# MANUTENÇÃO: shared_songs.song_data NÃO recebe estes campos (contrato rígido ResumoHarmonicoResponse).
from __future__ import annotations

import hashlib
import json
import logging
import re
import statistics
import threading
from datetime import datetime, timezone

from flask import current_app

from ..database import db
from ..models import SharedSong, SongProfile

logger = logging.getLogger(__name__)

GENRES = (
    "Louvor e Adoração", "Gospel", "Rock", "Pop", "Sertanejo", "MPB", "Samba e Pagode", "Forró",
    "Reggae", "Funk", "Rap e Hip-hop", "Jazz e Blues", "Eletrônica", "Infantil", "Outros",
)
TEMPOS = ("lenta", "media", "rapida")
MAX_THEMES = 5
MIN_BPM, MAX_BPM = 40, 220
MAX_VOTES = 500
_GENRE_KEYS = {re.sub(r"[^a-z]", "", genre.lower()): genre for genre in GENRES}

SYSTEM_PROMPT = (
    "Você classifica músicas para um app de músicos (igrejas, bandas). Responda SOMENTE um objeto JSON com: "
    f"genero (um destes: {', '.join(GENRES)}), "
    "subgenero (texto curto em português, ex.: \"Adoração congregacional\", \"Celebração\", \"Rock alternativo\", "
    "\"Sertanejo universitário\"), andamento (\"lenta\", \"media\" ou \"rapida\"), "
    f"bpm (número inteiro aproximado entre {MIN_BPM} e {MAX_BPM}, ou null se não souber), "
    f"temas (lista com até {MAX_THEMES} temas curtos da letra em português, minúsculos, ex.: \"entrega\", \"graça\", "
    "\"saudade\") e sacra (true se for música cristã/religiosa, false se não for). "
    "Use o que você sabe da gravação original quando conhecer a música. Não escreva letra nem cifra."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _lyrics_excerpt(song_data: dict, limit: int = 1500) -> str:
    sheet = song_data.get("fullChordSheet") if isinstance(song_data.get("fullChordSheet"), dict) else {}
    lines = []
    for section in sheet.get("sections") or []:
        for line in (section or {}).get("linhas") or []:
            text = str((line or {}).get("letra") or "").strip()
            if text:
                lines.append(text)
    if not lines:
        chord = re.compile(r"^[\s|]*([A-G][#b]?[^\s]*\s*)+$")
        lines = [line.strip() for line in str(sheet.get("content") or "").splitlines() if line.strip() and not chord.match(line)]
    return "\n".join(lines)[:limit]


def _chords_excerpt(song_data: dict) -> str:
    blocks = ((song_data.get("harmonicSummary") or {}).get("blocos") or [])[:12]
    return " | ".join(" ".join(str(chord) for chord in (block or {}).get("acordes") or []) for block in blocks)[:400]


def build_prompt(song: SharedSong) -> str:
    data = song.song_data if isinstance(song.song_data, dict) else {}
    parts = [f"Título: {song.title}", f"Artista: {song.artist or 'desconhecido'}", f"Tom: {song.song_key or 'desconhecido'}"]
    chords = _chords_excerpt(data)
    if chords:
        parts.append(f"Acordes: {chords}")
    lyrics = _lyrics_excerpt(data)
    if lyrics:
        parts.append(f"Trecho da letra:\n{lyrics}")
    return "\n".join(parts)


def normalize_classification(value) -> dict | None:
    """Aceita só o vocabulário combinado; o que vier fora disso é descartado."""
    if not isinstance(value, dict):
        return None
    genre = _GENRE_KEYS.get(re.sub(r"[^a-z]", "", str(value.get("genero") or "").lower().replace("&", "e")))
    if genre is None:
        return None
    tempo = str(value.get("andamento") or "").strip().lower().replace("é", "e").replace("á", "a")
    tempo = tempo if tempo in TEMPOS else None
    try:
        bpm = int(round(float(value.get("bpm"))))
    except (TypeError, ValueError):
        bpm = None
    if bpm is not None and not MIN_BPM <= bpm <= MAX_BPM:
        bpm = None
    themes = []
    for theme in value.get("temas") or []:
        text = str(theme or "").strip().lower()[:40]
        if text and text not in themes:
            themes.append(text)
    sacred = value.get("sacra")
    return {
        "genero": genre,
        "subgenero": str(value.get("subgenero") or "").strip()[:60] or None,
        "andamento": tempo,
        "bpmEstimado": bpm,
        "temas": themes[:MAX_THEMES],
        "sacra": sacred if isinstance(sacred, bool) else genre in {"Louvor e Adoração", "Gospel"},
    }


def _client():
    from openai import OpenAI

    from .providers.deepseek_provider import DEEPSEEK_BASE_URL

    key = current_app.config.get("DEEPSEEK_API_KEY")
    if not key:
        return None
    return OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL, timeout=float(current_app.config.get("CATALOG_CLASSIFY_TIMEOUT_SECONDS", 20)), max_retries=0)


def request_classification(song: SharedSong, client=None) -> dict | None:
    client = client or current_app.extensions.get("catalog_classifier_client") or _client()
    if client is None:
        return None
    response = client.responses.create(
        model=current_app.config.get("DEEPSEEK_MODEL"),
        input=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": build_prompt(song)}],
        text={"format": {"type": "json_object"}},
        max_output_tokens=300,
        reasoning={"effort": "none"},
    )
    try:
        return normalize_classification(json.loads(getattr(response, "output_text", "") or ""))
    except (TypeError, ValueError):
        return None


def profile_row(song_id, create=False) -> SongProfile | None:
    row = db.session.get(SongProfile, song_id)
    if row is None and create:
        row = SongProfile(song_id=song_id)
        db.session.add(row)
    return row


def is_classified(song: SharedSong) -> bool:
    row = profile_row(song.id)
    return row is not None and isinstance(row.classification, dict)


def classify(song: SharedSong, client=None) -> dict | None:
    """Classifica e guarda no perfil da música. Não faz commit."""
    result = request_classification(song, client)
    if result is None:
        return None
    result = {**result, "origem": "ia", "em": _now()}
    profile_row(song.id, create=True).classification = result
    return result


def classify_ids(song_ids, client=None) -> int:
    """Classifica as entradas novas depois do commit; falha da IA nunca atrapalha o salvamento."""
    done = 0
    for song_id in list(song_ids)[: int(current_app.config.get("CATALOG_CLASSIFY_PER_REQUEST", 3))]:
        try:
            song = db.session.get(SharedSong, song_id)
            if song is None or is_classified(song):
                continue
            if classify(song, client) is not None:
                db.session.commit()
                done += 1
        except Exception as error:  # noqa: BLE001
            db.session.rollback()
            logger.warning("catalog_classify_failed song=%s error=%s", song_id, type(error).__name__)
    return done


def classify_after_save(song_ids) -> None:
    """Dispara a classificação sem atrasar a resposta do salvamento (thread com contexto próprio)."""
    ids = [song_id for song_id in song_ids if song_id]
    app = current_app._get_current_object()
    if not ids or not app.config.get("CATALOG_CLASSIFY_ENABLED", True) or not app.config.get("DEEPSEEK_API_KEY"):
        return
    if not app.config.get("CATALOG_CLASSIFY_ASYNC", True):
        classify_ids(ids)
        return

    def run():
        with app.app_context():
            classify_ids(ids)
            db.session.remove()

    threading.Thread(target=run, name="catalog-classify", daemon=True).start()


def _voter(user_id) -> str:
    return hashlib.sha256(f"roudy-bpm:{user_id}".encode("utf-8")).hexdigest()[:16]


def parse_bpm(value) -> int | None:
    try:
        bpm = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return bpm if MIN_BPM <= bpm <= MAX_BPM else None


def record_bpm_vote(song: SharedSong, user_id, bpm) -> bool:
    """O BPM que a pessoa salvou na música dela vira um voto anônimo na versão do catálogo."""
    bpm = parse_bpm(bpm)
    if song is None or bpm is None or not user_id:
        return False
    row = profile_row(song.id, create=True)
    votes = dict(row.bpm_votes or {})
    voter = _voter(user_id)
    if votes.get(voter) == bpm:
        return False
    if voter not in votes and len(votes) >= MAX_VOTES:
        return False
    votes[voter] = bpm
    row.bpm_votes = votes
    return True


def community_bpm(votes) -> tuple[int | None, int]:
    values = [value for value in (votes or {}).values() if isinstance(value, int)]
    return (int(statistics.median(values)) if values else None), len(values)


def merge_profiles(keeper_id, extra_id) -> None:
    """Ao juntar duplicatas do catálogo: soma os votos de BPM e fica com a classificação que existir."""
    extra = db.session.get(SongProfile, extra_id)
    if extra is None:
        return
    keeper = profile_row(keeper_id, create=True)
    if not isinstance(keeper.classification, dict) and isinstance(extra.classification, dict):
        keeper.classification = extra.classification
    keeper.bpm_votes = {**(extra.bpm_votes or {}), **(keeper.bpm_votes or {})} or None
    db.session.delete(extra)
    db.session.flush()


def profile(song: SharedSong, row: SongProfile | None = None) -> dict:
    """Perfil público da música para recomendação (sem quem votou)."""
    row = row if row is not None else profile_row(song.id)
    info = row.classification if row is not None and isinstance(row.classification, dict) else {}
    bpm, votes = community_bpm(row.bpm_votes if row is not None else None)
    return {
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "key": song.song_key,
        "genero": info.get("genero"),
        "subgenero": info.get("subgenero"),
        "andamento": info.get("andamento"),
        # BPM de quem toca vale mais que o chute da IA a partir de 2 votos.
        "bpm": bpm if votes >= 2 else (info.get("bpmEstimado") or bpm),
        "bpmVotos": votes,
        "temas": info.get("temas") or [],
        "sacra": info.get("sacra"),
        "classificada": bool(info),
    }


def _themes_overlap(left, right) -> float:
    a, b = set(left or []), set(right or [])
    return len(a & b) / len(a | b) if a and b else 0.0


def similarity(base: dict, other: dict) -> float | None:
    """0 a 1. None = não combina (ex.: música sacra x secular, para não sugerir rock no culto)."""
    if not base.get("classificada") or not other.get("classificada"):
        return None
    if base.get("sacra") is not None and other.get("sacra") is not None and base["sacra"] != other["sacra"]:
        return None
    score = 0.0
    if base.get("subgenero") and other.get("subgenero") and base["subgenero"].lower() == other["subgenero"].lower():
        score += 0.35
    if base.get("genero") and base.get("genero") == other.get("genero"):
        score += 0.2
    score += 0.3 * _themes_overlap(base.get("temas"), other.get("temas"))
    if base.get("bpm") and other.get("bpm"):
        score += 0.15 * max(0.0, 1 - abs(base["bpm"] - other["bpm"]) / 40)
    elif base.get("andamento") and base.get("andamento") == other.get("andamento"):
        score += 0.1
    return round(score, 4)


def similar_songs(song: SharedSong, limit: int = 6) -> list[dict]:
    rows = {row.song_id: row for row in SongProfile.query.filter(SongProfile.classification.isnot(None)).all()}
    base = profile(song, rows.get(song.id))
    if not base["classificada"]:
        return []
    songs = SharedSong.query.filter(SharedSong.id.in_(list(rows))).all() if rows else []
    scored = []
    for other in songs:
        if other.id == song.id or other.normalized_title == song.normalized_title:
            continue
        other_profile = profile(other, rows.get(other.id))
        score = similarity(base, other_profile)
        if score is not None and score >= 0.3:
            scored.append({**other_profile, "score": score})
    scored.sort(key=lambda item: (-item["score"], item["title"] or ""))
    return scored[:limit]
