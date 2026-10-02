"""
Migração: popula shared_songs com todas as músicas únicas da biblioteca pessoal dos usuários.

Execução no Railway (só com autorização do Thiago):
    python migrate_personal_to_shared.py           # simulação: mostra o que faria, não grava nada
    python migrate_personal_to_shared.py --apply   # grava no catálogo

O script:
- Percorre todas as personal_songs não deletadas
- Chama SharedSongService.contribute() para cada uma
- Commita em lotes de 100 (somente com --apply)
- Nunca apaga nada: só cria entradas novas ou completa entradas que só tinham resumo
- Imprime um resumo ao final
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db
from app.models import PersonalSong
from app.services.shared_songs_service import SharedSongService

APPLY = "--apply" in sys.argv

app = create_app()

with app.app_context():
    songs = PersonalSong.query.filter_by(deleted_at=None).all()
    total = len(songs)
    contributed = 0
    upgraded = 0
    skipped = 0

    print(f"Total de músicas pessoais encontradas: {total}")
    print("Modo: GRAVAR" if APPLY else "Modo: SIMULAÇÃO (nada será gravado; use --apply para gravar)")

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
            db.session.commit() if APPLY else db.session.flush()
            print(f"  {i}/{total} processadas...")

    if APPLY:
        db.session.commit()
    else:
        db.session.rollback()
    print(f"\nConcluído ({'gravado' if APPLY else 'simulação, nada gravado'})!")
    print(f"  Novas entradas no catálogo: {contributed}")
    print(f"  Atualizadas (upgrade com cifra completa): {upgraded}")
    print(f"  Ignoradas (sem título ou duplicatas já completas): {skipped + (total - contributed - upgraded - skipped)}")
