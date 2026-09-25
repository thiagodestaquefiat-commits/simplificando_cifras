# roudy-scraper (piloto)

Projeto **isolado** para estudar a viabilidade de coletar **metadados** públicos de
músicas do Simplifica Cifras. Não faz parte do app ROUDY nem se conecta a ele.

Escopo atual:
- 1 spider (`simplifica_cifras`), **1 única URL** de teste;
- apenas metadados: título, artista, dificuldade, tom, capotraste, acordes, URL, data da coleta;
- **não** armazena letra nem cifra completa;
- **não** conecta ao MySQL nem à API do ROUDY;
- **não** faz crawling do catálogo.

## Rodando no Windows

```powershell
cd roudy-scraper
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
scrapy crawl simplifica_cifras
```

Resultado: `output/teste.json`. Os logs no terminal informam o status HTTP e os campos
encontrados e ausentes. As estatísticas do Scrapy (`downloader/request_count`) informam
quantas requisições foram feitas.

## Comportamento conservador (`roudy_scraper/settings.py`)

- `ROBOTSTXT_OBEY = True` (nunca desativar);
- 1 requisição concorrente, `DOWNLOAD_DELAY = 5` s, AutoThrottle ligado;
- User-Agent identificável; timeout de 30 s; cookies desligados;
- retry limitado (2x) só para 5xx/408/429; **403 não é repetido nem contornado**;
- 429 encerra o spider; indício de CAPTCHA/Cloudflare encerra sem contornar;
- `CLOSESPIDER_PAGECOUNT = 1` no spider, como trava de segurança.

> Atenção: se o `robots.txt` não puder ser baixado (erro de rede), o Scrapy trata o site
> como "sem regras". Confira no log a linha do `robots.txt` antes de interpretar o resultado.

## Seletores

A estrutura HTML ainda não foi inspecionada a partir do ambiente onde o código foi escrito.
Os extratores usam sinais semânticos com vários fallbacks (sem depender da posição dos
elementos) e devem ser ajustados depois do primeiro teste real:

| Campo | Ordem de tentativa |
|---|---|
| titulo | JSON-LD `name` → `<h1>` → `og:title` |
| artista | JSON-LD `byArtist`/`composer` → link `/cifras/{artista}` fora de nav/footer → slug da URL |
| tom | `data-key`/`data-tom`/`data-tone` → rótulo "Tom:" |
| capotraste | rótulo "Capotraste:"/"Capo:" |
| dificuldade | rótulo "Dificuldade:"/"Nível:" |
| acordes | `[data-chord]` → bloco com classe/id "acordes"/"chords" → **nomes** de acordes em `<pre><b>` (a letra não é guardada) |

A busca por rótulos ignora `<pre>`, `<script>` e `<style>`, então o corpo da cifra nunca é lido
nessa etapa.
