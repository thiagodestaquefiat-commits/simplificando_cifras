from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from functools import wraps

from flask import current_app, g, request

from ..database import db
from ..errors import ApiError
from ..models import CollaborationUser, ExternalIdentity, UserAccessToken
from .supabase_auth import SupabaseAuthError


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_digest(token: str) -> str:
    return _digest(token)


def issue_access_token(user: CollaborationUser) -> str:
    raw = secrets.token_urlsafe(current_app.config["COLLABORATION_TOKEN_BYTES"])
    db.session.add(UserAccessToken(id=str(uuid.uuid4()), user_id=user.id, token_hash=_digest(raw)))
    return raw


def authenticated(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, raw = header.partition(" ")
        if scheme.lower() != "bearer" or not raw.strip():
            raise ApiError("autenticacao_necessaria", "Informe o token pessoal para acessar os eventos.", 401)
        token = UserAccessToken.query.filter_by(token_hash=_digest(raw.strip()), revoked_at=None).first()
        if token is not None:
            user = db.session.get(CollaborationUser, token.user_id)
            if user is None:
                raise ApiError("usuario_invalido", "O usuário deste token não existe mais.", 401)
            token.last_used_at = datetime.now(timezone.utc)
            g.current_access_token = token
            g.auth_provider = "local"
        else:
            provider = current_app.extensions.get("supabase_auth")
            try:
                external = provider.validate(raw.strip()) if provider else None
            except SupabaseAuthError as error:
                raise ApiError("token_invalido", str(error), 401) from error
            if not external:
                raise ApiError("token_invalido", "O token pessoal é inválido ou foi revogado.", 401)
            subject = str(external["id"])
            identity = ExternalIdentity.query.filter_by(provider="supabase", subject=subject).first()
            user_id = identity.user_id if identity else subject
            metadata = external.get("user_metadata") if isinstance(external.get("user_metadata"), dict) else {}
            name = str(metadata.get("full_name") or metadata.get("name") or external.get("email") or "Usuário").strip()[:120]
            avatar_url = str(metadata.get("avatar_url") or metadata.get("picture") or "").strip()[:500] or None
            user = db.session.get(CollaborationUser, user_id)
            if user is None:
                user = CollaborationUser(id=user_id, name=name, avatar_url=avatar_url)
                db.session.add(user)
                db.session.flush()
            else:
                user.name = name or user.name
                user.avatar_url = avatar_url or user.avatar_url
            if identity is None:
                db.session.add(ExternalIdentity(provider="supabase", subject=subject, user_id=user.id))
                db.session.flush()
            g.current_access_token = None
            g.auth_provider = "supabase"
            g.external_subject = subject
        g.current_user = user
        return handler(*args, **kwargs)

    return wrapped
