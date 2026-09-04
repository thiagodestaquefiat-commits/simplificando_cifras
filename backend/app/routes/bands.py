from __future__ import annotations

import uuid
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify

from ..database import db
from ..errors import ApiError
from ..models import Band, BandMember, CollaborationUser, Event
from ..services.collaboration_auth import authenticated
from .events import _identifier, _json, _text


blueprint = Blueprint("bands", __name__, url_prefix="/api/collaboration/bands")
ACCESS_ROLES = {"owner", "leader", "member"}


def _band_or_404(band_id: str) -> Band:
    band = db.session.get(Band, str(band_id))
    if band is None:
        raise ApiError("equipe_nao_encontrada", "A equipe não foi encontrada.", 404)
    return band


def _membership(band: Band, user_id: str, required: bool = True) -> BandMember | None:
    member = BandMember.query.filter_by(band_id=band.id, user_id=user_id).first()
    if required and member is None:
        raise ApiError("acesso_negado", "Somente integrantes podem acessar esta equipe.", 403)
    return member


def _manager(band: Band, user_id: str) -> BandMember:
    member = _membership(band, user_id)
    if member.access_role not in {"owner", "leader"}:
        raise ApiError("permissao_insuficiente", "Somente proprietários e líderes podem gerenciar integrantes.", 403)
    return member


def _serialize(band: Band, current_user_id: str) -> dict:
    users = {user.id: user for user in CollaborationUser.query.filter(CollaborationUser.id.in_([item.user_id for item in band.members])).all()}
    members = sorted(band.members, key=lambda item: ({"owner": 0, "leader": 1, "member": 2}.get(item.access_role, 3), users.get(item.user_id).name.casefold() if users.get(item.user_id) else ""))
    current = next((item for item in members if item.user_id == current_user_id), None)
    return {
        "id": band.id,
        "name": band.name,
        "ownerId": band.owner_id,
        "currentUserRole": current.access_role if current else None,
        "permissions": {
            "canManageMembers": bool(current and current.access_role in {"owner", "leader"}),
            "canDelete": band.owner_id == current_user_id,
        },
        "members": [{
            "id": item.user_id,
            "name": users[item.user_id].name if item.user_id in users else "Integrante",
            "avatarUrl": users[item.user_id].avatar_url if item.user_id in users else None,
            "accessRole": item.access_role,
            "musicalRole": item.musical_role,
        } for item in members],
        "createdAt": band.created_at.isoformat() if band.created_at else "",
        "updatedAt": band.updated_at.isoformat() if band.updated_at else "",
    }


@blueprint.get("")
@authenticated
def list_bands():
    bands = Band.query.join(BandMember, BandMember.band_id == Band.id).filter(BandMember.user_id == g.current_user.id).order_by(Band.name).all()
    result = [_serialize(band, g.current_user.id) for band in bands]
    db.session.commit()
    return jsonify({"bands": result}), 200


@blueprint.post("")
@authenticated
def create_band():
    payload = _json()
    band = Band(
        id=_identifier(payload.get("id"), "id", f"band_{uuid.uuid4().hex}"),
        name=_text(payload.get("name"), 160, "name", True),
        owner_id=g.current_user.id,
    )
    if db.session.get(Band, band.id) is not None:
        raise ApiError("equipe_existente", "Esta equipe já existe.", 409)
    db.session.add(band)
    db.session.flush()
    db.session.add(BandMember(
        band_id=band.id, user_id=g.current_user.id, access_role="owner",
        musical_role=_text(payload.get("musicalRole"), 80, "musicalRole") or "Liderança",
    ))
    db.session.commit()
    return jsonify(_serialize(band, g.current_user.id)), 201


@blueprint.get("/<band_id>")
@authenticated
def get_band(band_id: str):
    band = _band_or_404(band_id)
    _membership(band, g.current_user.id)
    result = _serialize(band, g.current_user.id)
    db.session.commit()
    return jsonify(result), 200


@blueprint.post("/<band_id>/members")
@authenticated
def add_member(band_id: str):
    band = _band_or_404(band_id)
    actor = _manager(band, g.current_user.id)
    payload = _json()
    user_id = _identifier(payload.get("userId"), "userId")
    user = db.session.get(CollaborationUser, user_id)
    if user is None:
        raise ApiError("usuario_nao_encontrado", "Esse usuário ainda precisa abrir e registrar o aplicativo.", 404)
    role = _text(payload.get("accessRole"), 20, "accessRole") or "member"
    if role not in ACCESS_ROLES or role == "owner":
        raise ApiError("funcao_invalida", "Use a função leader ou member.", 400)
    if role == "leader" and actor.access_role != "owner":
        raise ApiError("somente_proprietario", "Somente o proprietário pode promover líderes.", 403)
    member = BandMember.query.filter_by(band_id=band.id, user_id=user_id).first()
    if member is None:
        member = BandMember(band_id=band.id, user_id=user_id)
        db.session.add(member)
    member.access_role = role
    member.musical_role = _text(payload.get("musicalRole"), 80, "musicalRole") or "Outra"
    band.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(_serialize(band, g.current_user.id)), 200


@blueprint.patch("/<band_id>/members/<user_id>")
@authenticated
def update_member(band_id: str, user_id: str):
    band = _band_or_404(band_id)
    actor = _manager(band, g.current_user.id)
    member = _membership(band, user_id)
    if member.access_role == "owner":
        raise ApiError("proprietario_protegido", "O proprietário não pode ter sua função alterada.", 400)
    payload = _json()
    role = _text(payload.get("accessRole", member.access_role), 20, "accessRole")
    if role not in {"leader", "member"}:
        raise ApiError("funcao_invalida", "Use a função leader ou member.", 400)
    if (role == "leader" or member.access_role == "leader") and actor.access_role != "owner":
        raise ApiError("somente_proprietario", "Somente o proprietário pode alterar líderes.", 403)
    member.access_role = role
    member.musical_role = _text(payload.get("musicalRole", member.musical_role), 80, "musicalRole") or "Outra"
    band.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(_serialize(band, g.current_user.id)), 200


@blueprint.delete("/<band_id>/members/<user_id>")
@authenticated
def remove_member(band_id: str, user_id: str):
    band = _band_or_404(band_id)
    actor = _manager(band, g.current_user.id)
    member = _membership(band, user_id)
    if member.access_role == "owner":
        raise ApiError("proprietario_protegido", "O proprietário não pode ser removido da equipe.", 400)
    if member.access_role == "leader" and actor.access_role != "owner":
        raise ApiError("somente_proprietario", "Somente o proprietário pode remover líderes.", 403)
    linked_events = Event.query.filter_by(band_id=band.id, leader_id=user_id).count()
    if linked_events:
        raise ApiError("lider_com_eventos", "Transfira a liderança dos eventos desta pessoa antes de removê-la.", 409)
    db.session.delete(member)
    band.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return "", 204


@blueprint.delete("/<band_id>")
@authenticated
def delete_band(band_id: str):
    band = _band_or_404(band_id)
    if band.owner_id != g.current_user.id:
        raise ApiError("somente_proprietario", "Somente o proprietário pode excluir a equipe.", 403)
    for event in Event.query.filter_by(band_id=band.id).all():
        event.band_id = None
    db.session.delete(band)
    db.session.commit()
    return "", 204
