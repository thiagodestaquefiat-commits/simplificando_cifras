"""Account-scoped collaboration. No writes to PersonalSong or SharedSong.

Field-aware three-way merges preserve disjoint edits. Atomic version predicates
protect against simultaneous workers; operation receipts make retries idempotent.
"""
import copy
import hashlib
import json
import math
import secrets
import uuid
from datetime import timedelta, timezone
from flask import Blueprint, g, jsonify, request
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from .. import limiter
from ..database import db
from ..errors import ApiError
from ..models import CollaborationUser, ProfileAvatar, UserHandle
from ..models.playlist_collaboration import CollaborativePlaylist as Playlist, PlaylistMember as Member, PlaylistInvite as Invite, PlaylistOperation as Operation, PlaylistNotification as Notice, now
from ..services.collaboration_auth import authenticated, token_digest

blueprint = Blueprint("playlist_collaboration", __name__, url_prefix="/api/collaborative-playlists")
FIELDS = ("name", "description", "coverImage")
ITEM_FIELDS = ("song", "playback", "notes")
SONG_FIELDS = {"id", "title", "artist", "key", "originalKey", "capo", "blocos", "sections", "summary", "fullChordSheet", "editorData", "tablature", "tablatures", "tuning", "instrument", "bpm", "meter", "youtubeUrl", "video", "artworkUrl", "coverUrl", "sheetMusic", "playbackSettings", "chordSheet"}
SONG_FIELDS.update({"youtubeVideoId", "youtubeThumbnailUrl", "youtubeChannelTitle", "sourceInfo"})


def payload():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ApiError("entrada_invalida", "Envie um objeto JSON válido.")
    return value


def clean(value):
    if not isinstance(value, dict) or not isinstance(value.get("name"), str) or not value["name"].strip():
        raise ApiError("playlist_invalida", "Informe o nome da playlist.")
    items = value.get("items", [])
    if not isinstance(items, list) or len(items) > 500:
        raise ApiError("playlist_invalida", "Use até 500 músicas por playlist.")
    cover = value.get("coverImage")
    if cover is not None and (not isinstance(cover, str) or not cover.startswith("data:image/") or len(cover) > 1_000_000):
        raise ApiError("playlist_invalida", "A capa da playlist é inválida.")
    result = {"name": value["name"].strip()[:120], "description": str(value.get("description") or "")[:300], "coverImage": cover, "items": []}
    ids = set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not 1 <= len(item["id"]) <= 160 or item["id"] in ids:
            raise ApiError("playlist_invalida", "Identificadores de músicas inválidos ou repetidos.")
        ids.add(item["id"])
        song = item.get("song")
        if not isinstance(song, dict) or not isinstance(song.get("title"), str) or not song["title"].strip():
            raise ApiError("playlist_invalida", "Uma música não possui conteúdo válido.")
        playback = item.get("playback", {})
        if not isinstance(playback, dict):
            raise ApiError("playlist_invalida", "Ajustes da música inválidos.")
        for key in ("semitones", "capo", "bpm", "scrollSpeed", "fontSize", "tablatureFontSize"):
            number = playback.get(key)
            if number is not None and (isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number)):
                raise ApiError("playlist_invalida", "Os ajustes numéricos da música são inválidos.")
        result["items"].append({"id": item["id"], "song": {k: v for k, v in song.items() if k in SONG_FIELDS}, "playback": {k: v for k, v in playback.items() if k in {"semitones", "capo", "bpm", "meter", "scrollSpeed", "instrument", "sheetView", "fontSize", "tablatureFontSize"}}, "notes": str(item.get("notes") or "")[:500]})
    if len(json.dumps(result, ensure_ascii=False).encode()) > 4_000_000:
        raise ApiError("playlist_grande", "A playlist excede 4 MB.", 413)
    return result


def actor(user_id):
    user = db.session.get(CollaborationUser, user_id)
    avatar = db.session.get(ProfileAvatar, user_id)
    handle = db.session.get(UserHandle, user_id)
    return {"id": user_id, "name": user.name if user and "@" not in user.name else "Integrante ROUDY", "avatarUrl": avatar.data_url if avatar else user.avatar_url if user else None, "username": handle.username if handle else None}


def require_member(playlist_id, allow_deleted=False):
    row = db.session.get(Playlist, playlist_id)
    if row is None or db.session.get(Member, (playlist_id, g.current_user.id)) is None:
        raise ApiError("nao_encontrado", "Playlist não encontrada.", 404)
    if row.deleted and not allow_deleted:
        raise ApiError("playlist_excluida", "Esta playlist foi excluída por um integrante.", 410)
    return row


def serialize(row, people=None):
    return {"id": row.id, "data": row.data, "version": row.version, "deleted": row.deleted, "createdAt": row.created_at.isoformat(), "updatedAt": row.updated_at.isoformat(), "members": [dict(people[m.user_id] if people else actor(m.user_id), role="owner") for m in Member.query.filter_by(playlist_id=row.id).order_by(Member.joined_at, Member.user_id)]}


def notify(row, summary, kind="playlist"):
    # Durable notifications survive playlist deletion; never notify the actor.
    for member in Member.query.filter_by(playlist_id=row.id):
        if member.user_id != g.current_user.id:
            db.session.add(Notice(id=str(uuid.uuid4()), playlist_id=row.id, recipient_id=member.user_id, actor_id=g.current_user.id, playlist_name=row.data["name"], summary=summary, kind=kind))


def conflict():
    raise ApiError("conflito_playlist", "Outra pessoa alterou os mesmos dados. Seus ajustes foram preservados neste dispositivo para revisão.", 409)


def merge(base, desired, current):
    result = copy.deepcopy(current)
    changes = []
    def field(target, before, after, key, label):
        if before.get(key) != after.get(key):
            if target.get(key) not in (before.get(key), after.get(key)):
                conflict()
            if target.get(key) != after.get(key):
                changes.append(label)
            target[key] = copy.deepcopy(after.get(key))
    for key, label in [("name", "alterou o nome da playlist"), ("description", "alterou a descrição"), ("coverImage", "alterou a capa")]:
        field(result, base, desired, key, label)
    old, new = ({i["id"]: i for i in data["items"]} for data in (base, desired))
    present = {i["id"]: i for i in result["items"]}
    for item_id, before in old.items():
        if item_id not in new:
            if item_id in present and present[item_id] != before:
                conflict()
            if present.pop(item_id, None):
                changes.append(f'removeu a música “{before["song"]["title"]}”')
        elif new[item_id] != before:
            if item_id not in present:
                conflict()
            for key in ITEM_FIELDS:
                if key == "playback":
                    target = present[item_id]["playback"]
                    old_playback, new_playback = before["playback"], new[item_id]["playback"]
                    labels = {"semitones": "o tom (transposição em semitons)", "capo": "o capotraste", "bpm": "o BPM", "meter": "o compasso", "scrollSpeed": "a velocidade da rolagem", "instrument": "o instrumento", "sheetView": "a visualização", "fontSize": "o tamanho da letra", "tablatureFontSize": "o tamanho da tablatura"}
                    for setting in set(old_playback) | set(new_playback):
                        field(target, old_playback, new_playback, setting, f'alterou {labels.get(setting, setting)} de “{new[item_id]["song"]["title"]}” ({old_playback.get(setting, "padrão")} para {new_playback.get(setting, "padrão")})')
                else:
                    field(present[item_id], before, new[item_id], key, f'alterou {"as observações" if key == "notes" else "o conteúdo"} de “{new[item_id]["song"]["title"]}”')
    for item_id, after in new.items():
        if item_id not in old:
            if item_id in present and present[item_id] != after:
                conflict()
            if item_id not in present:
                changes.append(f'adicionou a música “{after["song"]["title"]}”')
            present[item_id] = copy.deepcopy(after)
    base_order = [i["id"] for i in base["items"] if i["id"] in new]
    desired_order = [i["id"] for i in desired["items"] if i["id"] in old]
    if base_order != desired_order:
        current_order = [i["id"] for i in current["items"] if i["id"] in old and i["id"] in new]
        if current_order not in (base_order, desired_order):
            conflict()
        order = [i["id"] for i in desired["items"]] + [i["id"] for i in current["items"] if i["id"] not in new]
        changes.append("reordenou as músicas")
    else:
        order = [i["id"] for i in current["items"]] + [i for i in new if i not in old]
    result["items"] = [present.pop(i) for i in dict.fromkeys(order) if i in present]
    result["items"].extend(present.values())
    return result, list(dict.fromkeys(changes))


@blueprint.post("")
@limiter.limit("60 per hour")
@authenticated
def create():
    body = payload()
    client_id = body.get("clientId")
    if not isinstance(client_id, str) or not 1 <= len(client_id) <= 160:
        raise ApiError("entrada_invalida", "Identificador local inválido.")
    row = Playlist.query.filter_by(creator_id=g.current_user.id, client_id=client_id).first()
    if row:
        if row.deleted:
            raise ApiError("playlist_excluida", "Esta playlist já foi excluída.", 410)
        return jsonify(playlist=serialize(row))
    row = Playlist(id=str(uuid.uuid4()), creator_id=g.current_user.id, client_id=client_id, data=clean(body.get("data")))
    db.session.add(row)
    db.session.flush()
    db.session.add(Member(playlist_id=row.id, user_id=g.current_user.id))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        row = Playlist.query.filter_by(creator_id=g.current_user.id, client_id=client_id).first()
        if not row or row.deleted:
            conflict()
    return jsonify(playlist=serialize(row)), 201


@blueprint.get("")
@authenticated
def inbox():
    rows = Playlist.query.join(Member, Member.playlist_id == Playlist.id).filter(Member.user_id == g.current_user.id).all()
    invites = Invite.query.join(Playlist, Playlist.id == Invite.playlist_id).filter(Invite.recipient_id == g.current_user.id, Invite.status == "pending", Invite.expires_at > now(), Playlist.deleted.is_(False)).all()
    notices = Notice.query.filter_by(recipient_id=g.current_user.id).order_by(Notice.created_at.desc()).limit(250).all()
    users = {n.actor_id for n in notices} | {i.sender_id for i in invites}
    users.update(m.user_id for m in Member.query.filter(Member.playlist_id.in_([r.id for r in rows])))
    people = {user_id: actor(user_id) for user_id in sorted(users)}
    # Do not download every song/photo or rebuild the UI on unchanged polling.
    fingerprint = [[(r.id, r.version, r.deleted) for r in sorted(rows, key=lambda r: r.id)], [i.id for i in invites], [(n.id, str(n.read_at)) for n in notices], people]
    cursor = hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()
    if request.args.get("since") == cursor:
        return jsonify(unchanged=True, cursor=cursor)
    return jsonify(cursor=cursor, playlists=[serialize(row, people) for row in rows], invitations=[{"id": i.id, "playlistId": i.playlist_id, "playlistName": db.session.get(Playlist, i.playlist_id).data["name"], "inviter": people[i.sender_id], "createdAt": i.created_at.isoformat()} for i in invites], notifications=[{"id": "playlist:" + n.id, "playlistId": n.playlist_id, "kind": "playlist", "title": people[n.actor_id]["name"], "actorName": people[n.actor_id]["name"], "avatarUrl": people[n.actor_id]["avatarUrl"], "summary": n.summary + " · " + n.playlist_name, "unread": n.read_at is None, "createdAt": n.created_at.isoformat()} for n in notices])


@blueprint.post("/<playlist_id>/operations")
@authenticated
def edit(playlist_id):
    row = require_member(playlist_id, allow_deleted=True)
    body = payload()
    operation_id = body.get("operationId")
    if not isinstance(operation_id, str) or not 8 <= len(operation_id) <= 80:
        raise ApiError("entrada_invalida", "Identificador da alteração inválido.")
    receipt = db.session.get(Operation, (row.id, operation_id))
    if receipt:
        if receipt.actor_id != g.current_user.id:
            conflict()
        return jsonify(playlist=serialize(row))
    if row.deleted:
        raise ApiError("playlist_excluida", "Esta playlist foi excluída.", 410)
    if body.get("delete"):
        if body.get("baseVersion") != row.version:
            conflict()
        data, changes, deleted = row.data, ["excluiu a playlist"], True
    else:
        data, changes = merge(clean(body.get("base")), clean(body.get("data")), row.data)
        data, deleted = clean(data), False
    version = row.version
    # One database transaction reserves this revision, writes its receipt and all notices.
    changed = db.session.execute(update(Playlist).where(Playlist.id == row.id, Playlist.version == version, Playlist.deleted.is_(False)).values(data=data, deleted=deleted, version=version + 1, updated_at=now()).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        db.session.rollback()
        conflict()
    db.session.expire(row)
    notify(row, "; ".join(changes)) if changes else None
    db.session.add(Operation(playlist_id=row.id, operation_id=operation_id, actor_id=g.current_user.id, version=row.version))
    db.session.commit()
    return jsonify(playlist=serialize(row))


@blueprint.post("/<playlist_id>/invitations")
@limiter.limit("60 per hour")
@authenticated
def invite(playlist_id):
    row = require_member(playlist_id)
    recipient = payload().get("recipientId")
    if recipient is not None and (not isinstance(recipient, str) or not db.session.get(CollaborationUser, recipient)):
        raise ApiError("usuario_invalido", "Usuário não encontrado.", 404)
    if recipient and db.session.get(Member, (row.id, recipient)):
        raise ApiError("ja_integrante", "Esta pessoa já participa da playlist.", 409)
    if recipient:
        existing = Invite.query.filter_by(playlist_id=row.id, recipient_id=recipient, status="pending").filter(Invite.expires_at > now()).first()
        if existing:
            return jsonify(id=existing.id), 200
    raw = None if recipient else secrets.token_urlsafe(32)
    invitation = Invite(id=str(uuid.uuid4()), playlist_id=row.id, sender_id=g.current_user.id, recipient_id=recipient, token_hash=token_digest(raw) if raw else None, expires_at=now() + timedelta(days=7))
    db.session.add(invitation)
    db.session.commit()
    return jsonify(id=invitation.id, token=raw, expiresAt=invitation.expires_at.isoformat()), 201


def find_invite(value, link=False):
    invitation = Invite.query.filter_by(token_hash=token_digest(value)).first() if link else db.session.get(Invite, value)
    if not invitation:
        raise ApiError("convite_invalido", "Convite não encontrado.", 404)
    if not link and invitation.recipient_id != g.current_user.id:
        raise ApiError("convite_invalido", "Convite não encontrado.", 404)
    if invitation.expires_at.replace(tzinfo=timezone.utc) <= now():
        raise ApiError("convite_expirado", "Este convite expirou. Peça um novo link.", 410)
    row = db.session.get(Playlist, invitation.playlist_id)
    if row.deleted:
        raise ApiError("playlist_excluida", "Esta playlist foi excluída.", 410)
    return invitation, row


@blueprint.get("/links/<token>")
@limiter.limit("60 per minute")
def preview(token):
    invitation, row = find_invite(token, True)
    if invitation.status != "pending":
        raise ApiError("convite_utilizado", "Este convite já foi utilizado.", 410)
    # A bearer link reveals a preview, not the songs or membership list.
    return jsonify(playlistName=row.data["name"], inviter=actor(invitation.sender_id), expiresAt=invitation.expires_at.isoformat())


@blueprint.post("/invitations/<value>/<action>")
@authenticated
def respond(value, action):
    if action not in ("accept", "reject"):
        raise ApiError("entrada_invalida", "Resposta inválida.")
    link = bool(payload().get("link"))
    invitation, row = find_invite(value, link)
    if invitation.status == "accepted" and invitation.accepted_by == g.current_user.id:
        return jsonify(playlist=serialize(row))
    if invitation.status != "pending":
        raise ApiError("convite_utilizado", "Este convite já foi respondido.", 409)
    if link and action == "reject":
        # Do not let an anonymous bearer invalidate a link meant for someone else.
        return jsonify(status="dismissed")
    changed = db.session.execute(update(Invite).where(Invite.id == invitation.id, Invite.status == "pending").values(status="accepted" if action == "accept" else "rejected", accepted_by=g.current_user.id).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        db.session.rollback()
        conflict()
    if action == "accept" and not db.session.get(Member, (row.id, g.current_user.id)):
        # Serialize acceptance with playlist updates/deletion to avoid a late join after deletion.
        version = row.version
        locked = db.session.execute(update(Playlist).where(Playlist.id == row.id, Playlist.version == version, Playlist.deleted.is_(False)).values(version=version + 1, updated_at=now()).execution_options(synchronize_session=False))
        if locked.rowcount != 1:
            db.session.rollback()
            conflict()
        db.session.expire(row)
        notify(row, "aceitou o convite e entrou como colaborador com os mesmos direitos")
        db.session.add(Member(playlist_id=row.id, user_id=g.current_user.id))
    db.session.commit()
    return jsonify(playlist=serialize(row)) if action == "accept" else jsonify(status="rejected")


@blueprint.post("/notifications/<notice_id>/read")
@authenticated
def read_notice(notice_id):
    notice = Notice.query.filter_by(id=notice_id, recipient_id=g.current_user.id).first()
    if not notice:
        raise ApiError("nao_encontrado", "Notificação não encontrada.", 404)
    notice.read_at = now()
    db.session.commit()
    return jsonify(ok=True)
