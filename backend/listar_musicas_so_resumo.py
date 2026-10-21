"""
SOMENTE LEITURA — lista as músicas do catálogo compartilhado que ainda só têm o resumo harmônico
(sem Letra + Cifras). Não grava, não altera e não apaga nada no banco.

Para cada música informa se ALGUM usuário já tem a versão completa na biblioteca pessoal:
  - "SIM" -> dá para completar o catálogo a partir dessa versão (script de preenchimento, com OK).
  - "NÃO" -> precisa ser completada (PDF/arquivo, colar a cifra ou "Completar cifra").

Uso (no Railway, serviço do backend):  python listar_musicas_so_resumo.py
Gera também o arquivo musicas_so_resumo.csv.
"""
import csv
import os
import sys

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
    """(título normalizado) -> artistas normalizados que já têm a versão completa em alguma biblioteca."""
    index = {}
    for personal in PersonalSong.query.filter(PersonalSong.deleted_at.is_(None)).all():
        data = personal.song_data if isinstance(personal.song_data, dict) else {}
        if not has_full_sheet(data, CATALOG_FULL_SHEET_SOURCES):
            continue
        title = normalize_text(data.get("title"))
        if title:
            index.setdefault(title, []).append(normalize_text(data.get("artist")) or None)
    return index


def main(app=None, csv_path="musicas_so_resumo.csv", out=sys.stdout):
    app = app or create_app()
    with app.app_context():
        catalog = SharedSong.query.order_by(SharedSong.title).all()
        complete = complete_personal_index()
        rows = []
        for song in catalog:
            if has_full_sheet(song.song_data):
                continue
            artists = complete.get(song.normalized_title, [])
            available = any(a is None or song.normalized_artist is None or same_artist(a, song.normalized_artist) for a in artists)
            rows.append({"titulo": song.title, "artista": song.artist or "", "tom": song.song_key or "",
                         "buscas": song.times_searched or 0, "versao_completa_em_biblioteca": "SIM" if available else "NÃO"})
        rows.sort(key=lambda row: (-row["buscas"], row["titulo"].lower()))
        total, filled = len(catalog), sum(1 for row in rows if row["versao_completa_em_biblioteca"] == "SIM")
        print(f"Catálogo compartilhado: {total} músicas", file=out)
        print(f"Completas (resumo + letra e cifra + letra): {total - len(rows)}", file=out)
        print(f"Só com resumo harmônico: {len(rows)}", file=out)
        print(f"  - já existe versão completa em alguma biblioteca: {filled}", file=out)
        print(f"  - precisam ser completadas pela equipe: {len(rows) - filled}\n", file=out)
        print("Ordem: as mais buscadas primeiro.\n", file=out)
        for number, row in enumerate(rows, 1):
            artist = f" — {row['artista']}" if row["artista"] else ""
            print(f"{number:>4}. {row['titulo']}{artist} | tom {row['tom'] or '?'} | {row['buscas']} buscas | completa em biblioteca: {row['versao_completa_em_biblioteca']}", file=out)
        if csv_path:
            with open(csv_path, "w", newline="", encoding="utf-8-sig") as handle:
                writer = csv.DictWriter(handle, fieldnames=["titulo", "artista", "tom", "buscas", "versao_completa_em_biblioteca"], delimiter=";")
                writer.writeheader()
                writer.writerows(rows)
            print(f"\nArquivo gerado: {csv_path}", file=out)
        return rows


if __name__ == "__main__":
    main()
