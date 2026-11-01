import math
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g
from sqlalchemy.exc import IntegrityError
from ..database import db
from ..errors import ApiError
from ..models.profile_cover import ProfileCover
from ..services.profile_avatar import normalize_avatar
from ..services.collaboration_auth import authenticated
from .. import limiter

blueprint = Blueprint("profile_cover", __name__, url_prefix="/api/collaboration/me/cover")


def payload(row):
    return {"coverImage": row.data_url if row else None,
            "position": {"x": row.x if row else 50, "y": row.y if row else 38},
            "version": row.version if row else 0}


@blueprint.get("")
@authenticated
def get_cover():
    return jsonify(payload(db.session.get(ProfileCover, g.current_user.id)))


@blueprint.put("")
@limiter.limit("30 per minute")
@authenticated
def save_cover():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "coverImage" not in body:
        raise ApiError("capa_invalida", "Informe a foto de capa ou null para removê-la.", 400)
    version = body.get("baseVersion")
    if type(version) is not int or version < 0:
        raise ApiError("capa_invalida", "Informe a versão da capa.", 400)
    position = body.get("position")
    if not isinstance(position, dict):
        raise ApiError("capa_invalida", "Informe o enquadramento.", 400)
    for axis in ("x", "y"):
        value = position.get(axis)
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ApiError("capa_invalida", "O enquadramento deve estar entre 0 e 100.", 400)
    image = normalize_avatar(body["coverImage"], max_bytes=1_500_000, max_side=1600)
    row = db.session.get(ProfileCover, g.current_user.id)
    if (row.version if row else 0) != version:
        return jsonify({"cover": payload(row), "erro": {"codigo": "capa_conflito", "mensagem": "A capa foi alterada em outro aparelho. Sua alteração local foi preservada."}}), 409
    if row is None:
        row = ProfileCover(user_id=g.current_user.id, data_url=image, x=position["x"], y=position["y"], version=1)
        db.session.add(row)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify({"cover": payload(db.session.get(ProfileCover, g.current_user.id))}), 409
    else:
        count = db.session.query(ProfileCover).filter_by(user_id=g.current_user.id, version=version).update(
            {"data_url": image, "x": position["x"], "y": position["y"], "version": version + 1,
             "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
        if count != 1:
            db.session.rollback()
            return jsonify({"cover": payload(db.session.get(ProfileCover, g.current_user.id))}), 409
        db.session.commit()
        db.session.refresh(row)
    return jsonify(payload(row))
