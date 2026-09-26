"""
Diagnóstico 2: mostra a estrutura das músicas sem sections.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.models import PersonalSong

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

        if shown < 5:
            print(f"\n=== {data.get('title')} — {data.get('artist')} ===")
            print(f"  keys: {list(data.keys())}")
            fcs = data.get("fullChordSheet")
            if fcs:
                print(f"  fullChordSheet.keys: {list(fcs.keys()) if isinstance(fcs, dict) else type(fcs)}")
                if isinstance(fcs, dict):
                    print(f"  fullChordSheet.source: {fcs.get('source')}")
                    content = str(fcs.get('content') or '')
                    print(f"  fullChordSheet.content (100 chars): {content[:100]!r}")
                    secs = fcs.get('sections')
                    print(f"  fullChordSheet.sections count: {len(secs) if isinstance(secs, list) else secs}")
            else:
                print(f"  sem fullChordSheet")
            shown += 1

    print(f"\nTotal mostradas: {shown} (limite 5)")
