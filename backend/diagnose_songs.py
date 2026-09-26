"""
Diagnóstico: mostra por que músicas não estão indo para o catálogo compartilhado.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.models import PersonalSong
from app.services.shared_songs_service import SharedSongService, normalize_text, SHAREABLE_SOURCE_TYPES

app = create_app()

with app.app_context():
    songs = PersonalSong.query.filter_by(deleted_at=None).all()
    print(f"Total: {len(songs)} músicas\n")

    no_title = no_source = no_sections = no_chords = ok = duplicate = 0

    for personal in songs:
        data = personal.song_data if isinstance(personal.song_data, dict) else {}

        if not data.get("title"):
            no_title += 1
            continue

        if not isinstance(data.get("sourceInfo"), dict):
            data = {**data, "sourceInfo": {"type": "manual", "name": None, "url": None}}

        source_type = (data.get("sourceInfo") or {}).get("type") or "manual"
        if source_type not in SHAREABLE_SOURCE_TYPES:
            no_source += 1
            print(f"  fonte inválida: {data.get('title')} [{source_type}]")
            continue

        # Verifica sections
        sections = data.get("sections")
        if not isinstance(sections, list):
            sections = (data.get("editorData") or {}).get("sections")
        if not isinstance(sections, list) or not sections:
            no_sections += 1
            print(f"  sem sections: {data.get('title')} | keys={list(data.keys())}")
            continue

        # Verifica acordes
        has_chords = any(
            any(isinstance(item, dict) and item.get("chord") for item in (line or {}).get("chords") or [])
            for section in sections if isinstance(section, dict)
            for line in section.get("lines") or []
        )
        if not has_chords:
            no_chords += 1
            print(f"  sem acordes: {data.get('title')}")
            continue

        ok += 1

    print(f"\nResumo:")
    print(f"  Sem título: {no_title}")
    print(f"  Fonte inválida: {no_source}")
    print(f"  Sem sections: {no_sections}")
    print(f"  Sem acordes nas sections: {no_chords}")
    print(f"  Aptas para o catálogo: {ok}")
