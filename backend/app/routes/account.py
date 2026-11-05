# MANUTENÇÃO: Exclusão da própria conta (Play Store exige no app e por link na web).
# MANUTENÇÃO: Só apaga a conta de quem está autenticado; exige confirmar digitando EXCLUIR.
from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from .. import limiter
from ..database import db
from ..errors import ApiError
from ..services.account_deletion import delete_account_data, delete_supabase_user
from ..services.collaboration_auth import authenticated

blueprint = Blueprint("account", __name__, url_prefix="/api/account")
CONFIRMATION = "EXCLUIR"


@blueprint.delete("")
@limiter.limit("5 per hour")
@authenticated
def delete_my_account():
    payload = request.get_json(silent=True) or {}
    if str(payload.get("confirm") or "").strip().upper() != CONFIRMATION:
        raise ApiError("confirmacao_necessaria", f"Digite {CONFIRMATION} para confirmar a exclusão da conta.", 400)
    user_id = g.current_user.id
    subject = g.get("external_subject") if g.get("auth_provider") == "supabase" else None
    try:
        summary = delete_account_data(user_id)
        db.session.commit()
    except Exception as error:  # noqa: BLE001 - nada é apagado pela metade
        db.session.rollback()
        current_app.logger.exception("account_deletion_failed")
        raise ApiError("exclusao_falhou", "Não foi possível excluir a conta agora. Tente de novo ou escreva para roudy.oficial@gmail.com.", 500) from error
    login_removed = delete_supabase_user(subject) if subject else True
    current_app.logger.info("account_deleted login_removed=%s", login_removed)
    return jsonify({"deleted": True, "loginRemoved": login_removed, "summary": summary}), 200
