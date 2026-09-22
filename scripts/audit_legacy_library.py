"""Audita e, somente com dupla confirmação, arquiva cópias intactas do catálogo legado.

Uso seguro em produção:
  python scripts/audit_legacy_library.py --report audit.json
  # revisar audit.json e o backup do banco antes de continuar
  python scripts/audit_legacy_library.py --report audit.json --apply --confirm <reportHash>

O modo padrão é somente leitura. O modo --apply faz um backup JSON adicional e usa
soft delete; músicas pessoais alteradas nunca correspondem às assinaturas legadas.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import create_app
from app.database import db
from app.models import EventRepertoireItem, PersonalSong


LEGACY_SIGNATURES = frozenset("""
8e6ede47 99df8e44 2dcfe4c5 5c5b179f 2b9a0b53 83e3e84f 95e3aa96 37d3aa40 7222d894 68fff31c
df861344 9b8e8381 412d4043 d73d6889 1abbe01d be7492c1 c2acc522 484af46f 860eda3c 9a4ccf2c
f380b5b3 54eba4e6 d1cce96a b030a9e8 274c9914 e522580a 83396185 b8da8f2d 61c2170e b6102d06
0ccbf44c b6da224d 9b348589 a0277a4f a79abe09 1ba904f8 35354368 573a6a31 e6e3e8b2 fdfeb01d
93bf0bb6 aa4f5fe4 aff279e1 1f3e7875 8083bc32 28aae0c4 91f2001a 7cf922fa bcc8ee35 a71d98de
a96cbb3c 15d90635 2c84c249 468ec42e 57f04300 2103f04f cf6371fe 900c6501 68cba51c d59be42d
ffe55382 82fb1bec 861606ec a5be9911 5ab8bf10 7b8e5440 e4b6d8d6 a41d0240 0605b299 7fff0775
33131dbd fe94fd6e 9f3e15cb 76a1d800 140029b2 03cfaf48 438588c0 2430b040 f6eb5e54 b66d1513
99e54990 46b90469 fc55fd51 f3b9b3e4 722b27a9 56782f58
""".split())


def canonical_song(song_data: dict) -> str:
    keys = ("id", "title", "artist", "key", "capo", "blocos", "fullChordSheet", "album", "coverUrl", "spotifyTrackId", "spotifyUri", "isrc")
    defaults = {"artist": "", "key": "", "capo": "", "blocos": [], "fullChordSheet": None, "album": None, "coverUrl": None, "spotifyTrackId": None, "spotifyUri": None, "isrc": None}
    value = {key: song_data.get(key, defaults.get(key)) for key in keys}
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def fnv1a_utf16(value: str) -> str:
    result = 2166136261
    encoded = value.encode("utf-16-le")
    for offset in range(0, len(encoded), 2):
        result ^= int.from_bytes(encoded[offset:offset + 2], "little")
        result = (result * 16777619) & 0xFFFFFFFF
    return f"{result:08x}"


def is_legacy(song: PersonalSong) -> bool:
    return fnv1a_utf16(canonical_song(song.song_data or {})) in LEGACY_SIGNATURES


def row_snapshot(song: PersonalSong) -> dict:
    return {
        "id": song.id, "ownerUserId": song.owner_user_id, "clientId": song.client_id,
        "version": song.version, "createdAt": song.created_at.isoformat(), "updatedAt": song.updated_at.isoformat(),
        "songData": song.song_data,
    }


def report_hash(rows: list[dict]) -> str:
    identity = [{"id": row["id"], "version": row["version"], "updatedAt": row["updatedAt"]} for row in rows]
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    app = create_app()
    with app.app_context():
        active = PersonalSong.query.filter_by(deleted_at=None).order_by(PersonalSong.id).all()
        matches = [song for song in active if is_legacy(song)]
        snapshots = [row_snapshot(song) for song in matches]
        ids = {str(song.song_data.get("id")) for song in matches if isinstance(song.song_data, dict)} | {song.client_id for song in matches}
        references = EventRepertoireItem.query.filter(EventRepertoireItem.song_id.in_(ids)).count() if ids else 0
        digest = report_hash(snapshots)
        report = {
            "generatedAt": datetime.now(timezone.utc).isoformat(), "mode": "apply" if args.apply else "dry-run",
            "reportHash": digest, "activePersonalSongs": len(active), "matchedLegacyCopies": len(matches),
            "preservedPersonalSongs": len(active) - len(matches), "affectedOwners": len({song.owner_user_id for song in matches}),
            "eventRepertoireReferences": references, "records": snapshots,
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if not args.apply:
            print(json.dumps({key: value for key, value in report.items() if key != "records"}, ensure_ascii=False, indent=2))
            return
        if not digest or args.confirm != digest:
            raise SystemExit("Confirmação inválida. Execute o dry-run e use exatamente o reportHash revisado.")
        backup = args.report.with_name(f"{args.report.stem}.backup-before-soft-delete.json")
        if backup.exists():
            raise SystemExit(f"Backup já existe; nenhuma alteração foi feita: {backup}")
        backup.write_text(json.dumps({"reportHash": digest, "records": snapshots}, ensure_ascii=False, indent=2), encoding="utf-8")
        now = datetime.now(timezone.utc)
        for song in matches:
            song.deleted_at = now
            song.version += 1
        db.session.commit()
        print(f"{len(matches)} cópias legadas arquivadas por soft delete. Backup: {backup}")


if __name__ == "__main__":
    main()
