from __future__ import annotations

from datetime import datetime, timezone

from ..database import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CollaborationUser(db.Model):
    __tablename__ = "collaboration_users"

    id = db.Column(db.String(80), primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class UserAccessToken(db.Model):
    __tablename__ = "user_access_tokens"

    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    last_used_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)


class ExternalIdentity(db.Model):
    __tablename__ = "external_identities"
    __table_args__ = (db.UniqueConstraint("provider", "subject", name="uq_external_identity"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    provider = db.Column(db.String(40), nullable=False)
    subject = db.Column(db.String(160), nullable=False)
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Band(db.Model):
    __tablename__ = "bands"

    id = db.Column(db.String(80), primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    owner_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    members = db.relationship("BandMember", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin")


class BandMember(db.Model):
    __tablename__ = "band_members"
    __table_args__ = (db.UniqueConstraint("band_id", "user_id", name="uq_band_member"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    band_id = db.Column(db.String(80), db.ForeignKey("bands.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), nullable=False, index=True)
    access_role = db.Column(db.String(20), nullable=False, default="member")
    musical_role = db.Column(db.String(80), nullable=False, default="Outra")
    joined_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class Event(db.Model):
    __tablename__ = "events"

    id = db.Column(db.String(80), primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    event_date = db.Column(db.String(10), nullable=False, default="")
    event_time = db.Column(db.String(5), nullable=False, default="")
    location = db.Column(db.String(240), nullable=False, default="")
    location_name = db.Column(db.String(200), nullable=False, default="")
    formatted_address = db.Column(db.String(500), nullable=False, default="")
    location_street = db.Column(db.String(200), nullable=False, default="")
    location_street_number = db.Column(db.String(40), nullable=False, default="")
    location_district = db.Column(db.String(160), nullable=False, default="")
    location_city = db.Column(db.String(160), nullable=False, default="")
    location_state = db.Column(db.String(120), nullable=False, default="")
    location_postal_code = db.Column(db.String(40), nullable=False, default="")
    location_country = db.Column(db.String(120), nullable=False, default="")
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    location_place_id = db.Column(db.String(240), nullable=False, default="")
    location_provider = db.Column(db.String(40), nullable=False, default="")
    description = db.Column(db.Text, nullable=False, default="")
    band_id = db.Column(db.String(80), db.ForeignKey("bands.id", ondelete="SET NULL"), nullable=True, index=True)
    leader_id = db.Column(db.String(80), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    members = db.relationship("EventMember", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin")
    repertoire = db.relationship("EventRepertoireItem", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin", order_by="EventRepertoireItem.position")
    changes = db.relationship("EventChange", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin", order_by="EventChange.created_at")


class EventMember(db.Model):
    __tablename__ = "event_members"
    __table_args__ = (db.UniqueConstraint("event_id", "user_id", name="uq_event_member"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(db.String(80), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.String(80), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(80), nullable=False, default="Outra")
    avatar_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)


class EventRepertoireItem(db.Model):
    __tablename__ = "event_repertoire_items"
    __table_args__ = (db.UniqueConstraint("event_id", "position", name="uq_event_repertoire_position"),)

    id = db.Column(db.String(80), primary_key=True)
    event_id = db.Column(db.String(80), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    song_id = db.Column(db.String(120), nullable=False, index=True)
    position = db.Column(db.Integer, nullable=False)
    shared_title = db.Column(db.String(160), nullable=False, default="")
    shared_artist = db.Column(db.String(160), nullable=False, default="")
    shared_key = db.Column(db.String(32), nullable=False, default="")
    shared_capo = db.Column(db.String(20), nullable=False, default="")
    shared_chord_sheet = db.Column(db.Text, nullable=False, default="")
    shared_notes = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class PersonalRepertoireOverride(db.Model):
    __tablename__ = "personal_repertoire_overrides"
    __table_args__ = (db.UniqueConstraint("repertoire_item_id", "user_id", name="uq_personal_repertoire_override"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(db.String(80), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    repertoire_item_id = db.Column(db.String(80), db.ForeignKey("event_repertoire_items.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.String(80), nullable=False, index=True)
    personal_title = db.Column(db.String(160), nullable=False, default="")
    personal_artist = db.Column(db.String(160), nullable=False, default="")
    personal_key = db.Column(db.String(32), nullable=False, default="")
    personal_capo = db.Column(db.String(20), nullable=False, default="")
    personal_chord_sheet = db.Column(db.Text, nullable=False, default="")
    personal_notes = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class EventChange(db.Model):
    __tablename__ = "event_changes"

    id = db.Column(db.String(36), primary_key=True)
    event_id = db.Column(db.String(80), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = db.Column(db.String(80), nullable=False)
    actor_name = db.Column(db.String(120), nullable=False)
    kind = db.Column(db.String(80), nullable=False)
    summary = db.Column(db.String(300), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
