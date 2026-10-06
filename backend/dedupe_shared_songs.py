"""
Deixa cada música uma única vez no catálogo compartilhado (shared_songs).

Execução no Railway (só com autorização do Thiago):
    python dedupe_shared_songs.py           # simulação: lista os grupos repetidos, não grava nada
    python dedupe_shared_songs.py --apply   # junta cada grupo numa entrada só

Mesma música = mesmo título e artista igual/parecido (ou sem artista). Fica a entrada com Letra + Cifras
(depois a mais buscada, depois a mais antiga); as buscas são somadas e os relatos de erro vão para ela.
As entradas repetidas são apagadas do catálogo. Nenhuma biblioteca pessoal é alterada.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db
from app.services.shared_songs_service import SharedSongService, duplicate_groups, merge_duplicates

APPLY = "--apply" in sys.argv

app = create_app()

with app.app_context():
    groups = duplicate_groups()
    removed = sum(len(group) - 1 for group in groups)
    print("Modo: GRAVAR" if APPLY else "Modo: SIMULAÇÃO (nada será gravado; use --apply para gravar)")
    for group in groups:
        keeper = group[0]
        print(f"\n{keeper.title} | {keeper.artist or '-'}")
        for song in group:
            mark = "FICA " if song is keeper else "sai  "
            letra = "com letra" if SharedSongService._has_full_sheet(song) else "só resumo"
            print(f"   {mark} {song.title} | {song.artist or '-'} | {letra} | buscas: {song.times_searched or 0}")
    if APPLY:
        for group in groups:
            merge_duplicates(group)
        db.session.commit()
    else:
        db.session.rollback()
    print(f"\nGrupos repetidos: {len(groups)} | entradas {'removidas' if APPLY else 'que seriam removidas'}: {removed}")
