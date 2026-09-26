"""
Migração: popula shared_songs com todas as músicas únicas da biblioteca pessoal dos usuários.

Execução no Railway:
    python migrate_personal_to_shared.py

O script:
- Percorre todas as personal_songs não deletadas
- Chama SharedSongService.contribute() para cada uma
- Commita em lotes de 100
- Imprime um resumo ao final
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db
from app.models import PersonalSong
from app.services.shared_songs_service import SharedSongService

app = create_app()

with app.app_context():
    songs = PersonalSong.query.filter_by(deleted_at=None).all()
    total = len(songs)
    contributed = 0
    upgraded = 0
    skipped = 0

    print(f"Total de músicas pessoais encontradas: {total}")

    for i, personal in enumerate(songs, 1):
        data = personal.song_data if isinstance(personal.song_data, dict) else {}
        if not data.get("title"):
            skipped += 1
            continue

        # Garante sourceInfo mínimo para passar a validação
        if not isinstance(data.get("sourceInfo"), dict):
            data = {**data, "sourceInfo": {"type": "manual", "name": None, "url": None}}

        result = SharedSongService.contribute(data, personal.owner_user_id)
        if result is not None:
            if result.times_searched is not None and result.times_searched > 0:
                upgraded += 1
            else:
                contributed += 1

        if i % 100 == 0:
            db.session.commit()
            print(f"  {i}/{total} processadas...")

    db.session.commit()
    print(f"\nConcluído!")
    print(f"  Novas entradas no catálogo: {contributed}")
    print(f"  Atualizadas (upgrade com cifra completa): {upgraded}")
    print(f"  Ignoradas (sem título ou duplicatas já completas): {skipped + (total - contributed - upgraded - skipped)}")
