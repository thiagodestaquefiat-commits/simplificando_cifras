from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request
from uuid import uuid4
from sqlalchemy.exc import IntegrityError

from .. import limiter
from ..errors import ApiError
from ..services.collaboration_auth import authenticated
from ..services.shared_songs_service import SharedSongService, normalize_text
from ..database import db
from ..models import SharedSong, SharedSongReport

blueprint = Blueprint("shared_songs", __name__, url_prefix="/api/shared-songs")

REPORT_REASONS = {"chords", "lyrics", "metadata", "formatting", "inappropriate", "other"}
REPORT_STATUSES = {"pending", "in_review", "resolved", "dismissed"}


def can_review():
    # Legacy local registration lets the caller choose an ID. It cannot grant reviewer privileges.
    return g.get("auth_provider") == "supabase" and g.get("external_subject") in current_app.config.get("SHARED_SONG_REVIEWER_IDS", [])


def require_reviewer():
    if not can_review():
        raise ApiError("acesso_negado", "Acesso restrito à equipe de revisão.", 403)


def report_payload():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ApiError("entrada_invalida", "Informe os dados do relato.", 400)
    return value


@blueprint.get("/report-target")
@limiter.limit("30 per minute")
@authenticated
def report_target():
    # Exact identity only: never associate a personal song with a fuzzy match.
    title = normalize_text(str(request.args.get("title", ""))[:255])
    artist = normalize_text(str(request.args.get("artist", ""))[:255]) or None
    song = SharedSong.query.filter_by(normalized_title=title, normalized_artist=artist).first() if title else None
    return jsonify({"song": {"id": song.id, "title": song.title, "artist": song.artist} if song else None})


@blueprint.post("/<song_id>/reports")
@limiter.limit("5 per minute; 30 per day")
@authenticated
def create_report(song_id):
    if db.session.get(SharedSong, song_id) is None:
        raise ApiError("nao_encontrado", "Música não encontrada no catálogo.", 404)
    data = report_payload()
    reason, details = data.get("reason"), data.get("details", "")
    if not isinstance(reason, str) or reason not in REPORT_REASONS or not isinstance(details, str) or len(details) > 2000:
        raise ApiError("entrada_invalida", "Escolha um motivo e use até 2.000 caracteres.", 400)
    existing = SharedSongReport.query.filter_by(song_id=song_id, reporter_id=g.current_user.id).first()
    if existing:
        return jsonify({"report": {"id": existing.id, "status": existing.status}, "duplicate": True}), 200
    report = SharedSongReport(id=str(uuid4()), song_id=song_id, reporter_id=g.current_user.id, reason=reason, details=details.strip())
    db.session.add(report)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ApiError("relato_existente", "Você já enviou um relato para esta música.", 409)
    return jsonify({"report": {"id": report.id, "status": report.status}}), 201


@blueprint.get("/review-capability")
@authenticated
def review_capability():
    return jsonify({"canReview": can_review()})


@blueprint.get("/reports")
@authenticated
def list_reports():
    require_reviewer()
    status = request.args.get("status", "pending")
    if status not in REPORT_STATUSES:
        raise ApiError("entrada_invalida", "Estado inválido.", 400)
    try:
        offset = max(0, int(request.args.get("offset", "0")))
    except ValueError:
        raise ApiError("entrada_invalida", "Página inválida.", 400)
    rows = db.session.query(SharedSongReport, SharedSong).join(SharedSong, SharedSongReport.song_id == SharedSong.id).filter(SharedSongReport.status == status).order_by(SharedSongReport.created_at, SharedSongReport.id).offset(offset).limit(51).all()
    return jsonify({"hasMore": len(rows) > 50, "reports": [{"id": r.id, "songId": s.id, "title": s.title, "artist": s.artist, "songData": s.song_data, "reason": r.reason, "details": r.details, "status": r.status, "reviewNote": r.review_note, "createdAt": r.created_at.isoformat()} for r, s in rows[:50]]})


@blueprint.patch("/reports/<report_id>")
@authenticated
def review_report(report_id):
    require_reviewer()
    report = db.session.get(SharedSongReport, report_id)
    if report is None:
        raise ApiError("nao_encontrado", "Relato não encontrado.", 404)
    data = report_payload()
    status, note = data.get("status"), data.get("reviewNote", "")
    if not isinstance(status, str) or status not in REPORT_STATUSES or not isinstance(note, str) or len(note) > 2000:
        raise ApiError("entrada_invalida", "Revise o estado e a observação.", 400)
    report.status, report.review_note, report.reviewed_by = status, note.strip(), g.current_user.id
    db.session.commit()
    # Reviewing a report NEVER changes or deletes a song or a personal library.
    return jsonify({"report": {"id": report.id, "status": report.status}})


def _rate_limit() -> str:
    return current_app.config.get("SHARED_SONG_SEARCH_RATE_LIMIT", "30 per minute")


@blueprint.get("/search")
@limiter.limit(_rate_limit)
@authenticated
def search_shared_songs():
    title = str(request.args.get("title") or "").strip()[:160]
    artist = str(request.args.get("artist") or "").strip()[:160] or None
    if not title:
        raise ApiError("entrada_invalida", "Informe o título da música.", 400)
    personal = SharedSongService.search_personal(g.current_user.id, title, artist)
    if personal is not None:
        data = personal.song.song_data
        return jsonify({"match": {
            "source": "personal", "id": personal.song.id, "clientId": personal.song.client_id,
            "title": data.get("title"), "artist": data.get("artist"), "score": 1.0, "songData": personal.summary,
        }}), 200
    match = SharedSongService.search(title, artist)
    if match is None:
        return jsonify({"match": None}), 200
    song = match.song
    return jsonify({"match": {
        "source": "shared", "id": song.id, "title": song.title, "artist": song.artist, "key": song.song_key, "capo": song.capo,
        "score": round(match.score, 4), "timesSearched": song.times_searched, "songData": song.song_data,
    }}), 200
