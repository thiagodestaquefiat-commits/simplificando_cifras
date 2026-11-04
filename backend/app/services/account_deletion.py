# MANUTENÇÃO: Exclusão de conta (exigência da Play Store e da LGPD), decidida pelo Thiago em 04/11/2026.
# MANUTENÇÃO: Apaga perfil, biblioteca, playlists, eventos e equipes de que a pessoa é dona, e a conta no
# MANUTENÇÃO: Supabase. Músicas que ela enviou ao catálogo compartilhado continuam, sem o nome dela.
# MANUTENÇÃO: Em eventos de outras pessoas: sai do evento, as mensagens ficam como "Conta excluída" e os
# MANUTENÇÃO: áudios dela são apagados. Tudo é apagado explicitamente (não depende de cascata do banco).
from __future__ import annotations

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import current_app

from ..database import db
from ..models import (
    Band, BandMember, CollaborationUser, CollaborativePlaylist, ContextAcknowledgement, DirectEventInvitation,
    Event, EventAudio, EventChange, EventInvitation, EventMember, EventMessage, EventRepertoireItem,
    ExternalIdentity, PersonalPlaylist, PersonalRepertoireOverride, PersonalSong, PlaylistInvite, PlaylistMember,
    PlaylistNotification, PlaylistOperation, ProfileAvatar, ProfileCover, ProfileInstrument, SharedPlaylist,
    SharedSong, SharedSongReport, SongReviewReceipt, UserAccessToken, UserHandle, VocalKeyMemory,
)

logger = logging.getLogger(__name__)

DELETED_NAME = "Conta excluída"


def _delete(query) -> int:
    return query.delete(synchronize_session=False)


def _delete_events(event_ids: list[str]) -> int:
    if not event_ids:
        return 0
    message_ids = [row.id for row in EventMessage.query.filter(EventMessage.event_id.in_(event_ids)).all()]
    if message_ids:
        _delete(EventAudio.query.filter(EventAudio.message_id.in_(message_ids)))
    for model in (EventMessage, EventChange, EventRepertoireItem, PersonalRepertoireOverride, SongReviewReceipt,
                  ContextAcknowledgement, EventInvitation, DirectEventInvitation, EventMember):
        _delete(model.query.filter(model.event_id.in_(event_ids)))
    return _delete(Event.query.filter(Event.id.in_(event_ids)))


def _refresh_vocal_history(event_ids: list[str]) -> None:
    """Mesma regra da exclusão de evento: guarda o tom dos outros vocalistas antes de apagar."""
    try:
        from .vocal_key_history import refresh_history, vocalist_ids
        for event in Event.query.filter(Event.id.in_(event_ids)).all():
            refresh_history(vocalist_ids(event))
    except Exception:  # noqa: BLE001 - histórico de tom é melhoria; não pode impedir a exclusão
        logger.warning("account_deletion_vocal_history_failed", exc_info=True)


def delete_account_data(user_id: str) -> dict:
    """Apaga os dados da conta no banco do ROUDY. Não faz commit (quem chama decide)."""
    summary = {}
    owned_events = [row.id for row in Event.query.filter_by(leader_id=user_id).all()]
    _refresh_vocal_history(owned_events)
    summary["eventos"] = _delete_events(owned_events)

    # Eventos de outras pessoas: sai do evento; mensagens anonimizadas; áudio (voz) apagado.
    _delete(EventMember.query.filter_by(user_id=user_id))
    _delete(PersonalRepertoireOverride.query.filter_by(user_id=user_id))
    _delete(DirectEventInvitation.query.filter_by(recipient_id=user_id))
    _delete(SongReviewReceipt.query.filter_by(user_id=user_id))
    _delete(ContextAcknowledgement.query.filter_by(user_id=user_id))
    for invitation in EventInvitation.query.filter_by(accepted_by=user_id).all():
        invitation.accepted_by = None
    sent = EventMessage.query.filter_by(sender_id=user_id).all()
    audio_ids = [message.id for message in sent if message.message_type == "audio"]
    if audio_ids:
        _delete(EventAudio.query.filter(EventAudio.message_id.in_(audio_ids)))
    for message in sent:
        message.sender_name, message.sender_avatar_url = DELETED_NAME, None
        if message.message_type == "audio":
            message.deleted, message.content = True, ""
    for change in EventChange.query.filter_by(actor_id=user_id).all():
        change.actor_name = DELETED_NAME

    # Equipes (bandas) de que é dona e participação nas dos outros.
    owned_bands = [row.id for row in Band.query.filter_by(owner_id=user_id).all()]
    if owned_bands:
        for event in Event.query.filter(Event.band_id.in_(owned_bands)).all():
            event.band_id = None
        _delete(BandMember.query.filter(BandMember.band_id.in_(owned_bands)))
        summary["equipes"] = _delete(Band.query.filter(Band.id.in_(owned_bands)))
    _delete(BandMember.query.filter_by(user_id=user_id))

    # Playlists colaborativas criadas por ela e participação nas dos outros.
    owned_playlists = [row.id for row in CollaborativePlaylist.query.filter_by(creator_id=user_id).all()]
    if owned_playlists:
        for model in (PlaylistInvite, PlaylistMember, PlaylistNotification, PlaylistOperation):
            _delete(model.query.filter(model.playlist_id.in_(owned_playlists)))
        _delete(CollaborativePlaylist.query.filter(CollaborativePlaylist.id.in_(owned_playlists)))
    _delete(PlaylistMember.query.filter_by(user_id=user_id))
    _delete(PlaylistInvite.query.filter((PlaylistInvite.sender_id == user_id) | (PlaylistInvite.recipient_id == user_id)))
    _delete(PlaylistNotification.query.filter((PlaylistNotification.recipient_id == user_id) | (PlaylistNotification.actor_id == user_id)))

    # Biblioteca e playlists pessoais.
    summary["musicas"] = _delete(PersonalSong.query.filter_by(owner_user_id=user_id))
    summary["playlists"] = _delete(PersonalPlaylist.query.filter_by(owner_user_id=user_id))
    _delete(SharedPlaylist.query.filter_by(owner_user_id=user_id))

    # Catálogo compartilhado: a música fica, sem o nome de quem enviou. Relatos de erro dela saem.
    for song in SharedSong.query.filter_by(contributed_by=user_id).all():
        song.contributed_by = None
    _delete(SharedSongReport.query.filter_by(reporter_id=user_id))
    for report in SharedSongReport.query.filter_by(reviewed_by=user_id).all():
        report.reviewed_by = None

    # Perfil e acesso.
    for model, column in ((ProfileAvatar, "user_id"), (ProfileCover, "user_id"), (ProfileInstrument, "user_id"),
                          (VocalKeyMemory, "vocalist_id"), (UserHandle, "user_id"), (UserAccessToken, "user_id"),
                          (ExternalIdentity, "user_id")):
        _delete(model.query.filter(getattr(model, column) == user_id))
    _delete(CollaborationUser.query.filter_by(id=user_id))
    return summary


def delete_supabase_user(subject: str | None) -> bool:
    """Apaga o login no Supabase (precisa de SUPABASE_SERVICE_ROLE_KEY, só no servidor). False se não deu."""
    url = str(current_app.config.get("SUPABASE_URL") or "").rstrip("/")
    key = str(current_app.config.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not subject or not url or not key:
        return False
    request = Request(f"{url}/auth/v1/admin/users/{subject}", method="DELETE",
                      headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=float(current_app.config.get("SUPABASE_AUTH_TIMEOUT_SECONDS", 6))):
            return True
    except HTTPError as error:
        if error.code == 404:
            return True  # já não existe
        logger.warning("account_deletion_supabase_failed status=%s", error.code)
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        logger.warning("account_deletion_supabase_unreachable", exc_info=True)
    return False
