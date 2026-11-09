import io
import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, current_app, g, request, jsonify, send_file
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from .. import limiter
from ..database import db
from ..errors import ApiError
from ..models import EventAudio, EventMessage
from ..services.collaboration_auth import authenticated
from ..services.chat_audio import normalize_audio, MAX_BYTES
from .events import _event_or_404, _member, _serialize_message

blueprint = Blueprint("event_audio", __name__, url_prefix="/api/collaboration/events")


def existing(event_id, message_id):
    row = db.session.get(EventMessage, message_id)
    if row and (row.event_id != event_id or row.sender_id != g.current_user.id or row.message_type != "audio"):
        raise ApiError("audio_existente", "Identificador de mensagem já utilizado.", 409)
    return row


@blueprint.post("/<event_id>/messages/audio")
@limiter.limit("12 per minute")
@authenticated
def create_audio(event_id):
    event = _event_or_404(event_id)
    _member(event, g.current_user.id)
    request.max_content_length = min(request.max_content_length or MAX_BYTES + 65536, MAX_BYTES + 65536)
    request.max_form_parts = 2
    if request.content_length and request.content_length > MAX_BYTES + 65536:
        raise ApiError("audio_grande", "Áudio maior que 3 MB.", 413)
    message_id = request.form.get("clientId", "")
    try:
        message_id = str(uuid.UUID(message_id))
    except ValueError:
        raise ApiError("audio_invalido", "Identificador do áudio inválido.", 400)
    row = existing(event_id, message_id)
    if row:
        return jsonify(_serialize_message(row)), 200
    count = EventMessage.query.filter(EventMessage.sender_id == g.current_user.id,
                                     EventMessage.message_type == "audio",
                                     EventMessage.created_at >= datetime.now(timezone.utc) - timedelta(days=1)).count()
    if count >= 60:
        raise ApiError("audio_limite", "Limite diário de 60 áudios atingido. Tente novamente amanhã.", 429)
    uploads = list(request.files.items(multi=True))
    if len(uploads) != 1 or uploads[0][0] != "audio":
        raise ApiError("audio_invalido", "Envie uma gravação.", 400)
    upload = uploads[0][1]
    data, duration = normalize_audio(upload.read(MAX_BYTES + 1))
    row = EventMessage(id=message_id, event_id=event.id, sender_id=g.current_user.id,
                       sender_name=g.current_user.name, sender_avatar_url=g.current_user.avatar_url,
                       message_type="audio", content="Mensagem de áudio",
                       poll={"duration": duration, "size": len(data), "mimeType": "audio/mp4"}, reactions={})
    try:
        db.session.add(row)
        db.session.flush()
        db.session.add(EventAudio(message_id=message_id, data=data))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        row = existing(event_id, message_id)
        if not row:
            current_app.logger.warning("event_audio_write_failed requestId=%s type=IntegrityError", g.get("request_id"))
            raise ApiError("audio_armazenamento", "Não foi possível guardar o áudio no servidor. Tente novamente.", 503) from None
    except SQLAlchemyError as error:
        db.session.rollback()
        current_app.logger.warning("event_audio_write_failed requestId=%s type=%s", g.get("request_id"), type(error).__name__)
        raise ApiError("audio_armazenamento", "Não foi possível guardar o áudio no servidor. Tente novamente.", 503) from None
    return jsonify(_serialize_message(row)), 201


@blueprint.get("/<event_id>/messages/<message_id>/audio")
@authenticated
def read_audio(event_id, message_id):
    _member(_event_or_404(event_id), g.current_user.id)
    message = db.session.get(EventMessage, message_id)
    if not message or message.event_id != event_id or message.deleted or message.message_type != "audio":
        raise ApiError("audio_ausente", "Áudio não disponível.", 404)
    audio = db.session.get(EventAudio, message_id)
    if not audio:
        raise ApiError("audio_ausente", "Áudio não disponível.", 404)
    response = send_file(io.BytesIO(audio.data), mimetype="audio/mp4", download_name="mensagem.m4a", conditional=True)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
