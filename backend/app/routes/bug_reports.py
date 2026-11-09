"""Support intake: image bytes exist only in this request, never in database/files."""
import base64
import hashlib
import io
import json
import uuid
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from flask import Blueprint, current_app, g, request, jsonify
from flask.wrappers import Request as FlaskRequest
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from .. import limiter
from ..database import db
from ..errors import ApiError
from ..services.collaboration_auth import authenticated
from ..services.support_images import normalize_image, MAX_INPUT

blueprint = Blueprint('bug_reports', __name__, url_prefix='/api/collaboration')


class SupportMemoryRequest(FlaskRequest):
    # Werkzeug normally spools large multipart files to disk. Keep this endpoint's
    # bounded upload in RAM, without changing uploads elsewhere in the application.
    def _get_file_stream(self, total_content_length, content_type, filename=None, content_length=None):
        if self.path == '/api/collaboration/bug-reports':
            return io.BytesIO()
        return super()._get_file_stream(total_content_length, content_type, filename, content_length)


class BugReport(db.Model):
    __tablename__ = 'bug_reports'
    id = db.Column(db.String(36), primary_key=True)
    owner_id = db.Column(db.String(80), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False)
    steps = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False)
    email_status = db.Column(db.String(24), nullable=False, default='pending')


class SupportAttempt(db.Model):
    """Metadata only; no image, path, URL, Base64 or retry job."""
    __tablename__ = 'support_attempts'
    report_id = db.Column(db.String(36), db.ForeignKey('bug_reports.id'), primary_key=True)
    fingerprint = db.Column(db.String(64), nullable=False)
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)


def deliver(report, image=None):
    config = current_app.config
    key = config.get('BREVO_API_KEY')
    sender = config.get('BUG_REPORT_SENDER_EMAIL')
    recipient = config.get('BUG_REPORT_RECIPIENT_EMAIL')
    if not all((key, sender, recipient)):
        return 'not_configured'
    payload = {
        'sender': {'email': sender, 'name': config.get('BUG_REPORT_SENDER_NAME') or 'ROUDY — Suporte'},
        'to': [{'email': recipient}], 'subject': 'ROUDY — Relato de bug ' + report.id,
        'textContent': f'Protocolo: {report.id}\nData UTC: {report.created_at.isoformat()}\n\nProblema:\n{report.description}\n\nPassos:\n{report.steps}',
        'headers': {'IdempotencyKey': 'support-' + report.id},
    }
    if image:
        raw, extension = image
        payload['attachment'] = [{'name': 'print.' + extension, 'content': base64.b64encode(raw).decode('ascii')}]
    req = Request('https://api.brevo.com/v3/smtp/email', data=json.dumps(payload).encode(),
                  headers={'api-key': key, 'Content-Type': 'application/json', 'Accept': 'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=10) as response:
            return 'accepted' if response.status == 201 else 'uncertain'
    except HTTPError as error:
        return 'retry' if error.code == 429 else 'failed' if 400 <= error.code < 500 else 'uncertain'
    except (URLError, TimeoutError, OSError):
        # The provider might already have accepted it. Never blindly replay.
        return 'uncertain'


def result(report, status_code=200):
    return jsonify({'id': report.id, 'emailStatus': report.email_status}), status_code


@blueprint.post('/bug-reports')
@limiter.limit('5 per hour')
@authenticated
@limiter.limit('10 per day', key_func=lambda: str(g.current_user.id))
def create_report():
    request.max_content_length = MAX_INPUT + 64 * 1024
    request.max_form_parts = 4
    if request.content_length and request.content_length > request.max_content_length:
        raise ApiError('relato_grande', 'Relato muito grande.', 413)
    multipart = request.mimetype == 'multipart/form-data'
    data = request.form.to_dict() if multipart else request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError('relato_invalido', 'Preencha o relato.', 400)
    try:
        report_id = str(uuid.UUID(str(data.get('clientId', ''))))
    except ValueError:
        raise ApiError('relato_invalido', 'Identificador inválido.', 400)
    fields = []
    for name, minimum, maximum in [('description', 10, 4000), ('steps', 0, 2000)]:
        value = data.get(name, '')
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum or '\x00' in value:
            raise ApiError('relato_invalido', 'Descrição: 10 a 4000 caracteres. Passos: até 2000.', 400)
        fields.append(value.strip())
    owner = str(g.current_user.id)
    report = db.session.get(BugReport, report_id)
    if report:
        if report.owner_id != owner:
            raise ApiError('relato_conflito', 'Identificador já utilizado.', 409)
        if report.description != fields[0] or report.steps != fields[1]:
            raise ApiError('relato_conflito', 'Este protocolo pertence a outro conteúdo. Confirme o envio original antes de abrir um novo relato.', 409)
        if report.email_status in ('accepted', 'uncertain', 'sending'):
            # A stale sending request may have reached Brevo before a worker crash.
            attempt = db.session.get(SupportAttempt, report_id)
            if report.email_status == 'sending' and attempt and attempt.started_at:
                started = attempt.started_at.replace(tzinfo=timezone.utc)
                if started < datetime.now(timezone.utc)-timedelta(minutes=2):
                    report.email_status = 'uncertain'; db.session.commit()
            return result(report)
    else:
        count = BugReport.query.filter(BugReport.owner_id == owner, BugReport.created_at >= datetime.now(timezone.utc)-timedelta(days=1)).count()
        if count >= 10:
            raise ApiError('relato_limite', 'Limite diário de relatos atingido.', 429)
    uploads = list(request.files.items(multi=True)) if multipart else []
    if len(uploads) > 1 or any(name != 'image' for name, _ in uploads):
        raise ApiError('anexo_invalido', 'Envie somente uma imagem por relato.', 400)
    image = normalize_image(uploads[0][1].stream.read(MAX_INPUT+1)) if uploads else None
    digest = hashlib.sha256(json.dumps(fields, ensure_ascii=False).encode())
    digest.update(image[0] if image else b'')
    fingerprint = digest.hexdigest()
    if report:
        attempt = db.session.get(SupportAttempt, report_id)
        if not attempt or attempt.fingerprint != fingerprint:
            raise ApiError('relato_conflito', 'O conteúdo do relato mudou. Abra um novo formulário.', 409)
        if attempt.attempts >= 5:
            raise ApiError('relato_limite', 'Limite de tentativas deste relato atingido. O protocolo foi preservado para verificação pelo suporte.', 429)
    else:
        report = BugReport(id=report_id, owner_id=owner, description=fields[0], steps=fields[1], created_at=datetime.now(timezone.utc), email_status='pending')
        try:
            db.session.add(report); db.session.flush()
            db.session.add(SupportAttempt(report_id=report_id, fingerprint=fingerprint, attempts=0))
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            raise ApiError('relato_conflito', 'Relato já recebido. Tente novamente com o mesmo formulário.', 409)
        except SQLAlchemyError:
            db.session.rollback()
            raise ApiError('relato_indisponivel', 'Não foi possível salvar agora. Tente novamente.', 503) from None
    # Atomic claim: only one concurrent request can call the provider.
    claimed = db.session.query(BugReport).filter(BugReport.id == report_id, BugReport.email_status.in_(['pending','retry','not_configured','failed'])).update({'email_status':'sending'}, synchronize_session=False)
    if not claimed:
        db.session.rollback(); db.session.expire_all()
        return result(db.session.get(BugReport, report_id))
    attempt = db.session.get(SupportAttempt, report_id)
    attempt.started_at = datetime.now(timezone.utc); attempt.attempts += 1
    db.session.commit()
    status = deliver(report, image) if image else deliver(report)
    report.email_status = status
    db.session.commit()
    if status != 'accepted':
        current_app.logger.warning('bug_report_email_result id=%s status=%s', report_id, status)
    return result(report, 201)
