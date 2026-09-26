"""
Diagnóstico 3: mostra o conteúdo de 'blocos' das músicas sem sections.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.models import PersonalSong
from app.services.shared_songs_service import SharedSongService, SHAREABLE_SOURCE_TYPES

app = create_app()

with app.app_context():
    songs = PersonalSong.query.filter_by(deleted_at=None).all()

    shown = 0
    for personal in songs:
        data = personal.song_data if isinstance(personal.song_data, dict) else {}
        if not data.get("title"):
            continue
        sections = data.get("sections")
        if not isinstance(sections, list):
            sections = (data.get("editorData") or {}).get("sections")
        if isinstance(sections, list) and sections:
            continue  # tem sections, pula

        if shown >= 3:
            break

        print(f"\n=== {data.get('title')} ===")
        blocos = data.get("blocos")
        print(f"  blocos type: {type(blocos)}")
        if isinstance(blocos, list):
            print(f"  blocos count: {len(blocos)}")
            for b in blocos[:2]:
                print(f"  bloco: {json.dumps(b, ensure_ascii=False)[:200]}")
        else:
            print(f"  blocos value: {blocos!r}")

        # Tenta rodar o _summary_from_song e captura o erro
        if not isinstance(data.get("sourceInfo"), dict):
            data = {**data, "sourceInfo": {"type": "manual", "name": None, "url": None}}
        from pydantic import ValidationError
        try:
            result = SharedSongService._summary_from_song(data)
            print(f"  _summary_from_song: {'OK' if result else 'None (blocos vazios?)'}")
        except Exception as e:
            print(f"  _summary_from_song ERRO: {e}")

        shown += 1

    print(f"\nTotal mostradas: {shown}")
