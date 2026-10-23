"""Live playlists are separate from public snapshots and personal song libraries."""
from datetime import datetime, timezone
from ..database import db


def now():
    return datetime.now(timezone.utc)


class CollaborativePlaylist(db.Model):
    __tablename__ = "collaborative_playlists"
    __table_args__ = (db.UniqueConstraint("creator_id", "client_id", name="uq_collab_playlist_client"),)
    id = db.Column(db.String(36), primary_key=True)
    creator_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=False)
    client_id = db.Column(db.String(160), nullable=False)
    data = db.Column(db.JSON, nullable=False)
    version = db.Column(db.Integer, nullable=False, default=1)
    deleted = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)


class PlaylistMember(db.Model):
    __tablename__ = "playlist_members"
    playlist_id = db.Column(db.String(36), db.ForeignKey("collaborative_playlists.id"), primary_key=True)
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), primary_key=True)
    joined_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)


class PlaylistInvite(db.Model):
    __tablename__ = "playlist_invites"
    id = db.Column(db.String(36), primary_key=True)
    playlist_id = db.Column(db.String(36), db.ForeignKey("collaborative_playlists.id"), nullable=False, index=True)
    sender_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=False)
    recipient_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=True, index=True)
    token_hash = db.Column(db.String(64), nullable=True, unique=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    accepted_by = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)


class PlaylistOperation(db.Model):
    __tablename__ = "playlist_operations"
    playlist_id = db.Column(db.String(36), db.ForeignKey("collaborative_playlists.id"), primary_key=True)
    operation_id = db.Column(db.String(80), primary_key=True)
    actor_id = db.Column(db.String(80), nullable=False)
    version = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)


class PlaylistNotification(db.Model):
    __tablename__ = "playlist_notifications"
    id = db.Column(db.String(36), primary_key=True)
    playlist_id = db.Column(db.String(36), db.ForeignKey("collaborative_playlists.id"), nullable=False)
    recipient_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=False, index=True)
    actor_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=False)
    playlist_name = db.Column(db.String(120), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    kind = db.Column(db.String(30), default="playlist", nullable=False)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
