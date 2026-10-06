"""Catálogo com cada música uma única vez: agrupamento e junção das entradas repetidas."""
import uuid

from app.database import db
from app.models import SharedSong, SharedSongReport
from app.services.shared_songs_service import duplicate_groups, merge_duplicates, normalize_text
from test_event_permissions import register

FULL = {"fullChordSheet": {"source": "user_upload", "content": "G\nx", "sections": []}}


def add(title, artist, full=False, searched=0):
    song = SharedSong(id=str(uuid.uuid4()), title=title, artist=artist or None, normalized_title=normalize_text(title),
                      normalized_artist=normalize_text(artist) or None, song_data=dict(FULL) if full else {"fullChordSheet": None},
                      times_searched=searched)
    db.session.add(song)
    db.session.flush()
    return song


def test_groups_same_song_and_keeps_version_with_lyrics(client, app):
    register(client, "dup-a", "A")
    with app.app_context():
        summary = add("Alfa e Ômega", "Marine Friesen", searched=7)
        full = add("Alfa e Omega", "marine friesen", full=True, searched=2)
        blank = add("ALFA E ÔMEGA", "", searched=1)
        other = add("Alfa e Ômega", "Gabriela Rocha")
        add("Só uma", "Fulano")
        report = SharedSongReport(id=str(uuid.uuid4()), song_id=summary.id, reporter_id="dup-a", reason="letra_errada", details="")
        db.session.add(report)
        db.session.commit()
        groups = duplicate_groups()
        # Sem artista + dois artistas diferentes: a entrada sem artista é ambígua e fica de fora.
        assert [len(group) for group in groups] == [2] and groups[0][0].id == full.id
        keeper = merge_duplicates(groups[0])
        db.session.commit()
        assert keeper.times_searched == 9
        assert db.session.get(SharedSong, summary.id) is None
        assert db.session.get(SharedSong, blank.id) is not None and db.session.get(SharedSong, other.id) is not None
        assert db.session.get(SharedSongReport, report.id).song_id == full.id


def test_entry_without_artist_joins_the_only_artist(client, app):
    with app.app_context():
        named = add("Emaus", "Morada", full=True)
        blank = add("Emaús", None)
        db.session.commit()
        groups = duplicate_groups()
        assert len(groups) == 1 and groups[0][0].id == named.id
        merge_duplicates(groups[0])
        db.session.commit()
        assert SharedSong.query.count() == 1 and db.session.get(SharedSong, blank.id) is None


def test_keeper_gets_artist_from_duplicate(client, app):
    with app.app_context():
        blank = add("Lo", None, full=True)
        add("lo", "lk")
        db.session.commit()
        keeper = merge_duplicates(duplicate_groups()[0])
        db.session.commit()
        assert keeper.id == blank.id and keeper.artist == "lk"
