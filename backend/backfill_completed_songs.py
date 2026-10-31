"""
Manda para o catálogo compartilhado as músicas que a força-tarefa já completou antes de 30/10/2026
(na época, completar não enviava a música ao catálogo).

Execução no Railway (só com autorização do Thiago):
    python backfill_completed_songs.py           # simulação: lista o que seria completado, não grava nada
    python backfill_completed_songs.py --apply   # grava

Só completa entradas do catálogo que ainda têm apenas o resumo harmônico, usando a versão com Letra + Cifras
que alguém já tem na biblioteca (mesmo título, artista igual/parecido e mesmo tom).
Não cria músicas novas no catálogo e não altera nenhuma biblioteca pessoal.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db
from app.services.shared_songs_service import backfill_completions

APPLY = "--apply" in sys.argv
LABELS = {"user_upload": "PDF/arquivo", "web_source": "Cifra Club", "user_text": "letra colada"}

app = create_app()

with app.app_context():
    report = backfill_completions()
    print("Modo: GRAVAR" if APPLY else "Modo: SIMULAÇÃO (nada será gravado; use --apply para gravar)")
    for item in report:
        print(f"  {item['title']} | {item['artist'] or '-'} | tom {item['key'] or '?'} | {LABELS[item['source']]}"
              f" | {item['versions']} versão(ões) completas nas bibliotecas")
    if APPLY:
        db.session.commit()
    else:
        db.session.rollback()
    print(f"\nMúsicas {'completadas' if APPLY else 'que seriam completadas'} no catálogo: {len(report)}")
