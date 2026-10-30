"""
Classifica as músicas do catálogo compartilhado para as recomendações
(gênero, subgênero, andamento, BPM aproximado, temas e se é sacra). A IA não mexe em letra nem cifra.

Execução no Railway (só com autorização do Thiago; usa créditos do DeepSeek, ~R$0,002 por música):
    python classify_shared_songs.py                  # simulação: conta quantas faltam, não chama a IA
    python classify_shared_songs.py --apply          # classifica todas as que faltam
    python classify_shared_songs.py --apply --limit 50

Grava só na tabela nova shared_song_profiles. Pode ser rodado de novo: pula as já classificadas.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db
from app.models import SharedSong
from app.services.song_classifier import classify, is_classified

APPLY = "--apply" in sys.argv
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None

app = create_app()

with app.app_context():
    pending = [song for song in SharedSong.query.order_by(SharedSong.times_searched.desc()).all() if not is_classified(song)]
    if LIMIT is not None:
        pending = pending[:LIMIT]
    print(f"Músicas sem classificação: {len(pending)}")
    if not APPLY:
        print("Modo: SIMULAÇÃO (a IA não foi chamada; use --apply)")
        sys.exit(0)
    done = failed = 0
    for song in pending:
        try:
            result = classify(song)
            if result is None:
                failed += 1
                continue
            db.session.commit()
            done += 1
            print(f"  {song.title} | {result['genero']} / {result['subgenero'] or '-'} | {result['bpmEstimado'] or '?'} BPM")
        except Exception as error:  # noqa: BLE001
            db.session.rollback()
            failed += 1
            print(f"  ERRO {song.title}: {type(error).__name__}")
    print(f"\nClassificadas: {done} | sem resposta válida: {failed}")
