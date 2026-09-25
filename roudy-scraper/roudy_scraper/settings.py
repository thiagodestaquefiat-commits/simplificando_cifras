"""Configuração conservadora do piloto roudy-scraper."""

BOT_NAME = "roudy_scraper"
SPIDER_MODULES = ["roudy_scraper.spiders"]
NEWSPIDER_MODULE = "roudy_scraper.spiders"

# Identificação clara do crawler (ajuste o contato se desejar).
USER_AGENT = (
    "roudy-scraper/0.1 (piloto de pesquisa; contato: thiago.destaquefiat@gmail.com)"
)

# Respeita robots.txt. NUNCA desativar para obter acesso.
ROBOTSTXT_OBEY = True

# Baixa concorrência e intervalo entre requisições.
CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 5
RANDOMIZE_DOWNLOAD_DELAY = True
DOWNLOAD_TIMEOUT = 30

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 5
AUTOTHROTTLE_MAX_DELAY = 60
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
AUTOTHROTTLE_DEBUG = False

# Retry limitado e sem insistência em 403 (não contornar bloqueios).
RETRY_ENABLED = True
RETRY_TIMES = 2
RETRY_HTTP_CODES = [500, 502, 503, 504, 522, 524, 408, 429]

# Permite que o spider receba e registre 403/404/429/5xx em vez de descartá-los.
HTTPERROR_ALLOWED_CODES = [403, 404, 429, 500, 502, 503, 504]

# Deduplicação padrão de requisições (explícita para clareza).
DUPEFILTER_CLASS = "scrapy.dupefilters.RFPDupeFilter"

# Trava de segurança: o piloto nunca deve passar de poucas páginas.
CLOSESPIDER_PAGECOUNT = 5

COOKIES_ENABLED = False
TELNETCONSOLE_ENABLED = False
LOG_LEVEL = "INFO"

FEED_EXPORT_ENCODING = "utf-8"
FEEDS = {
    "output/teste.json": {
        "format": "json",
        "encoding": "utf8",
        "indent": 2,
        "overwrite": True,
    },
}

REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
