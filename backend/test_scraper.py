"""
Teste do ScraperAPI: busca 'É Tudo Sobre Você - Morada' no Cifra Club.
Rode no console do Railway: python test_scraper.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.services.web_search import make_web_searchers, direct_url

app = create_app()

with app.app_context():
    from flask import current_app
    key = current_app.config.get("SCRAPER_API_KEY", "")
    if not key:
        print("❌ SCRAPER_API_KEY não configurada!")
        sys.exit(1)

    print(f"✅ SCRAPER_API_KEY encontrada ({len(key)} chars)")

    titulo = "É Tudo Sobre Você"
    artista = "Morada"

    url = direct_url("cifraclub", titulo, artista)
    print(f"\n🔗 URL direta: {url}")

    sheet_finder, _ = make_web_searchers(key)
    print("🔍 Buscando cifra...")

    hit = sheet_finder(titulo, artista)
    if hit:
        print(f"\n✅ Cifra encontrada!")
        print(f"   Fonte: {hit.source_name}")
        print(f"   URL: {hit.url}")
        print(f"   Tamanho: {len(hit.content)} chars")
        print(f"\n--- Primeiros 500 chars ---")
        print(hit.content[:500])
    else:
        print("\n❌ Cifra NÃO encontrada — ScraperAPI não conseguiu extrair o conteúdo")
