"""Relatório manual e somente leitura de músicas sem Letra + Cifras.

O relatório não identifica proprietários e não altera o banco. Por padrão, escreve
somente no terminal. Um CSV é criado apenas quando ``--csv CAMINHO`` é informado.

Uso, a partir de ``backend``::

    python listar_musicas_so_resumo.py
    python listar_musicas_so_resumo.py --csv relatorios/musicas_so_resumo.csv
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.models import PersonalSong, SharedSong
from app.services.shared_songs_service import CATALOG_FULL_SHEET_SOURCES, normalize_text, same_artist


def has_full_sheet(song_data, accepted=None) -> bool:
    sheet = song_data.get("fullChordSheet") if isinstance(song_data, dict) else None
    if not isinstance(sheet, dict) or not str(sheet.get("content") or "").strip():
        return False
    return accepted is None or sheet.get("source") in accepted


def complete_personal_index():
    """Mapeia título normalizado para artistas com versão completa, sem expor usuários."""
    index = {}
    for personal in PersonalSong.query.filter(PersonalSong.deleted_at.is_(None)).all():
        data = personal.song_data if isinstance(personal.song_data, dict) else {}
        if not has_full_sheet(data, CATALOG_FULL_SHEET_SOURCES):
            continue
        title = normalize_text(data.get("title"))
        if title:
            index.setdefault(title, []).append(normalize_text(data.get("artist")) or None)
    return index


def main(app=None, csv_path=None, out=sys.stdout):
    app = app or create_app()
    with app.app_context():
        catalog = SharedSong.query.order_by(SharedSong.title).all()
        complete = complete_personal_index()
        rows = []
        for song in catalog:
            if has_full_sheet(song.song_data):
                continue
            artists = complete.get(song.normalized_title, [])
            available = any(
                artist is None or song.normalized_artist is None or same_artist(artist, song.normalized_artist)
                for artist in artists
            )
            rows.append({
                "titulo": song.title,
                "artista": song.artist or "",
                "tom": song.song_key or "",
                "buscas": song.times_searched or 0,
                "versao_completa_em_biblioteca": "SIM" if available else "NÃO",
            })
        rows.sort(key=lambda row: (-row["buscas"], row["titulo"].lower()))
        total = len(catalog)
        available_count = sum(row["versao_completa_em_biblioteca"] == "SIM" for row in rows)
        print(f"Catálogo compartilhado: {total} músicas", file=out)
        print(f"Completas: {total - len(rows)}", file=out)
        print(f"Só com resumo harmônico: {len(rows)}", file=out)
        print(f"  - versão completa disponível em alguma biblioteca: {available_count}", file=out)
        print(f"  - precisam ser completadas: {len(rows) - available_count}\n", file=out)
        for number, row in enumerate(rows, 1):
            artist = f" — {row['artista']}" if row["artista"] else ""
            print(
                f"{number:>4}. {row['titulo']}{artist} | tom {row['tom'] or '?'} | "
                f"{row['buscas']} buscas | completa disponível: {row['versao_completa_em_biblioteca']}",
                file=out,
            )
        if csv_path:
            destination = Path(csv_path).expanduser().resolve()
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("w", newline="", encoding="utf-8-sig") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "titulo", "artista", "tom", "buscas", "versao_completa_em_biblioteca"
                ], delimiter=";")
                writer.writeheader()
                writer.writerows(rows)
            print(f"\nArquivo gerado: {destination}", file=out)
        return rows


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", metavar="CAMINHO", help="gera o CSV somente no caminho explicitamente informado")
    return parser.parse_args(argv)


if __name__ == "__main__":
    arguments = parse_args()
    main(csv_path=arguments.csv)
