import importlib.util
from pathlib import Path

from app.models import EventRepertoireItem, PersonalSong
from test_event_permissions import register


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "audit_legacy_library.py"
SPEC = importlib.util.spec_from_file_location("audit_legacy_library", SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def legacy_song():
    return {
        "id": 1, "title": "A alegria", "key": "A", "capo": "",
        "blocos": [
            {"l": "A alegria", "c": "A  D  A  G D\nA  B7  E"},
            {"l": "O sentimento", "c": "A  A7  D  F\nA  E  A  E"},
            {"l": "posso pisar numa tropa", "c": "A  A7  D  F  (3x)\nA  E  A  E"},
            {"l": "Aleluia", "c": "A  D  A\nB7  E"},
        ],
    }


def test_audit_matches_only_pristine_legacy_song_and_has_no_cascade(client, app):
    register(client, "audit-user", "Audit")
    pristine = PersonalSong(id="legacy", owner_user_id="audit-user", client_id="legacy-client", song_data=legacy_song(), version=1)
    personalized_data = {**legacy_song(), "artist": "Minha versão"}
    personalized = PersonalSong(id="personal", owner_user_id="audit-user", client_id="personal-client", song_data=personalized_data, version=1)
    reference = EventRepertoireItem(id="item", event_id="event-missing", song_id="legacy-client", position=0)
    with app.app_context():
        from app.database import db
        db.session.add_all([pristine, personalized])
        db.session.flush()
        assert audit.is_legacy(pristine) is True
        assert audit.is_legacy(personalized) is False
        # song_id não é FK de PersonalSong: a auditoria deve apenas contar/preservar a referência.
        assert "personal_songs" not in {foreign_key.column.table.name for foreign_key in EventRepertoireItem.__table__.foreign_keys}
