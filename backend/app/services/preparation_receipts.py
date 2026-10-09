from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from ..database import db
from ..models import Event, EventChange, EventRepertoireItem, PersonalRepertoireOverride, SongReviewReceipt


REVISION_SCHEMA = 1
RELEVANT_FIELDS = ("key", "capo", "chordSheet", "notes")
CHANGE_TYPES = {
    "key": "KEY_CHANGED",
    "capo": "CAPO_CHANGED",
    "chordSheet": "STRUCTURE_CHANGED",
    "notes": "PERFORMANCE_NOTES_CHANGED",
}


def _effective(personal: str, shared: str) -> str:
    return personal if personal not in (None, "") else (shared or "")


def content_identity(value: str) -> dict:
    content = value or ""
    return {"sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(), "length": len(content)}


def revision_payload(event: Event, item: EventRepertoireItem, user_id: str) -> dict:
    override = PersonalRepertoireOverride.query.filter_by(
        event_id=event.id, repertoire_item_id=item.id, user_id=user_id
    ).first()
    return {
        "schema": REVISION_SCHEMA,
        "eventId": event.id,
        "repertoireItemId": item.id,
        "songId": item.song_id,
        "context": {
            "key": _effective(override.personal_key if override else "", item.shared_key),
            "capo": _effective(override.personal_capo if override else "", item.shared_capo),
            "chordSheet": content_identity(_effective(override.personal_chord_sheet if override else "", item.shared_chord_sheet)),
            "notes": content_identity(_effective(override.personal_notes if override else "", item.shared_notes)),
        },
    }


def revision_hash(payload: dict) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def current_revision(event: Event, item: EventRepertoireItem, user_id: str) -> tuple[str, dict]:
    payload = revision_payload(event, item, user_id)
    return revision_hash(payload), payload


def relevant_diff(reviewed: dict | None, current: dict) -> list[dict]:
    if not isinstance(reviewed, dict) or not isinstance(reviewed.get("context"), dict):
        return []
    before_context, after_context = reviewed["context"], current.get("context") or {}
    return [{"type": CHANGE_TYPES[field], "field": field, "before": before_context.get(field), "after": after_context.get(field)}
            for field in RELEVANT_FIELDS if before_context.get(field) != after_context.get(field)]


def _change_evidence(event_id: str, item: EventRepertoireItem, diff: list[dict]) -> tuple[list[dict], bool]:
    changes = EventChange.query.filter_by(event_id=event_id, song_id=item.song_id).order_by(EventChange.created_at.desc()).all()
    result, incomplete = [], False
    for value in diff:
        match = next((change for change in changes if change.change_type == value["type"]), None)
        evidence = dict(value)
        if match is None:
            evidence.update({"changedAt": None, "actorId": None})
            incomplete = True
        else:
            evidence.update({
                "changedAt": match.created_at.replace(tzinfo=timezone.utc).isoformat() if match.created_at.tzinfo is None else match.created_at.isoformat(),
                "actorId": match.actor_id,
            })
            if match.before_value is None or match.after_value is None:
                incomplete = True
            else:
                evidence["before"] = match.before_value
                evidence["after"] = match.after_value
        result.append(evidence)
    return result, incomplete


def serialize_preparation(event: Event, item: EventRepertoireItem, user_id: str) -> dict:
    current_hash, current_payload = current_revision(event, item, user_id)
    receipt = SongReviewReceipt.query.filter_by(event_id=event.id, repertoire_item_id=item.id, user_id=user_id).first()
    if receipt is None:
        return {
            "state": "NOT_STARTED", "reviewedAt": None, "reviewedRevision": None,
            "currentRevision": current_hash, "relevantChanges": [], "evidenceIncomplete": False,
        }
    if receipt.revision_hash == current_hash:
        return {
            "state": "READY", "reviewedAt": _iso(receipt.reviewed_at), "reviewedRevision": receipt.revision_hash,
            "currentRevision": current_hash, "relevantChanges": [], "evidenceIncomplete": False,
        }
    diff = relevant_diff(receipt.revision_payload, current_payload)
    evidence, incomplete = _change_evidence(event.id, item, diff)
    if not diff:
        incomplete = True
    return {
        "state": "CHANGED_AFTER_REVIEW", "reviewedAt": _iso(receipt.reviewed_at),
        "reviewedRevision": receipt.revision_hash, "currentRevision": current_hash,
        "relevantChanges": evidence, "evidenceIncomplete": incomplete,
    }


def mark_reviewed(event: Event, item: EventRepertoireItem, user_id: str, client_receipt_id: str,
                  expected_revision: str, reviewed_at: datetime) -> tuple[SongReviewReceipt, bool]:
    current_hash, payload = current_revision(event, item, user_id)
    if expected_revision != current_hash:
        raise StaleRevision(current_hash)
    receipt = SongReviewReceipt.query.filter_by(event_id=event.id, repertoire_item_id=item.id, user_id=user_id).first()
    if receipt is not None and receipt.revision_hash == current_hash:
        return receipt, False
    duplicate = SongReviewReceipt.query.filter_by(user_id=user_id, client_receipt_id=client_receipt_id).first()
    if duplicate is not None and duplicate is not receipt:
        raise ReceiptConflict()
    created = receipt is None
    if receipt is None:
        receipt = SongReviewReceipt(id=str(uuid.uuid4()), user_id=user_id, event_id=event.id, repertoire_item_id=item.id,
                                    song_id=item.song_id, band_id=event.band_id, client_receipt_id=client_receipt_id,
                                    revision_hash=current_hash, revision_payload=payload, reviewed_at=reviewed_at)
        db.session.add(receipt)
    else:
        receipt.song_id, receipt.band_id = item.song_id, event.band_id
        receipt.client_receipt_id, receipt.revision_hash = client_receipt_id, current_hash
        receipt.revision_payload, receipt.reviewed_at = payload, reviewed_at
        receipt.updated_at = datetime.now(timezone.utc)
    return receipt, created


def serialize_receipt(receipt: SongReviewReceipt) -> dict:
    return {
        "id": receipt.id, "userId": receipt.user_id, "eventId": receipt.event_id,
        "repertoireItemId": receipt.repertoire_item_id, "songId": receipt.song_id,
        "bandId": receipt.band_id, "reviewedRevision": receipt.revision_hash,
        "reviewedAt": _iso(receipt.reviewed_at), "clientReceiptId": receipt.client_receipt_id,
    }


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class StaleRevision(Exception):
    def __init__(self, current_revision_hash: str):
        super().__init__("A versão preparada não é mais a versão atual.")
        self.current_revision = current_revision_hash


class ReceiptConflict(Exception):
    pass
