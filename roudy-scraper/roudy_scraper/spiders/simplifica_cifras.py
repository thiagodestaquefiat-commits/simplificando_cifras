"""Spider piloto: coleta SOMENTE metadados de UMA página pública de música.

Não armazena letra nem cifra completa. Não segue links. Não pagina.

A estrutura HTML exata do site ainda não foi inspecionada a partir deste
ambiente, por isso os seletores priorizam sinais semânticos (JSON-LD, meta
tags, h1, rótulos textuais como "Tom:") com vários fallbacks, em vez de
posições fixas de elementos. Ajuste após o primeiro teste real.
"""

import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import scrapy

from roudy_scraper.items import MusicaMetadadosItem

URL_TESTE = "https://www.simplificacifras.com.br/cifras/ze-neto-e-cristiano/cadeira-cativa"

# Nome de acorde: C, C#m7, Bb/F, G7(9), Dsus4, F#m7(b5), A°, etc.
ACORDE_RE = re.compile(
    r"^[A-G](?:#|b)?"
    r"(?:m|maj|min|dim|aug|sus|add|M|°|º|\+)?"
    r"[0-9]*"
    r"(?:\([^)]{1,12}\)|(?:sus|add|maj|M|b|#)[0-9]{1,2})*"
    r"(?:/[A-G](?:#|b)?)?$"
)

# Texto fora destes elementos é considerado para busca de rótulos.
# <pre> é excluído para nunca ler o corpo da cifra nessa busca.
_TEXTOS_VISIVEIS = (
    "//body//text()[normalize-space()]"
    "[not(ancestor::script) and not(ancestor::style) and not(ancestor::noscript)"
    " and not(ancestor::pre) and not(ancestor::textarea)]"
)


def _limpar(texto):
    if texto is None:
        return None
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto or None


class SimplificaCifrasSpider(scrapy.Spider):
    name = "simplifica_cifras"
    allowed_domains = ["www.simplificacifras.com.br", "simplificacifras.com.br"]
    start_urls = [URL_TESTE]

    # Piloto: exatamente uma página.
    custom_settings = {"CLOSESPIDER_PAGECOUNT": 1}

    async def start(self):
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse, errback=self.on_error)

    # Compatibilidade com Scrapy < 2.13
    def start_requests(self):
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse, errback=self.on_error)

    # ------------------------------------------------------------------ #
    def parse(self, response):
        status = response.status
        self.logger.info("HTTP %s recebido de %s", status, response.url)

        if status == 403:
            self.logger.error("403 Forbidden: acesso recusado. NÃO será contornado.")
            return
        if status == 404:
            self.logger.warning("404: página não encontrada.")
            return
        if status == 429:
            self.logger.error("429 Too Many Requests: rate limit atingido. Parando.")
            self.crawler.engine.close_spider(self, "rate_limited")
            return
        if status >= 500:
            self.logger.error("Erro %s do servidor.", status)
            return

        corpo = response.text.lower()
        if "cf-challenge" in corpo or "g-recaptcha" in corpo or "hcaptcha" in corpo:
            self.logger.error("Possível desafio anti-bot/CAPTCHA detectado. Parando sem contornar.")
            return

        ld = self._json_ld(response)

        item = MusicaMetadadosItem()
        item["titulo"] = self._titulo(response, ld)
        item["artista"] = self._artista(response, ld)
        item["dificuldade"] = self._valor_rotulado(response, ("dificuldade", "nível", "nivel"))
        item["tom"] = self._tom(response)
        item["capotraste"] = self._valor_rotulado(response, ("capotraste", "capo"))
        item["acordes"] = self._acordes(response)
        item["url_origem"] = response.url
        item["coletado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        item["http_status"] = status

        ausentes = [
            k for k in ("titulo", "artista", "dificuldade", "tom", "capotraste", "acordes")
            if not item.get(k)
        ]
        item["campos_ausentes"] = ausentes
        encontrados = [k for k in ("titulo", "artista", "dificuldade", "tom", "capotraste", "acordes") if k not in ausentes]
        self.logger.info("Campos encontrados: %s", encontrados)
        if ausentes:
            self.logger.warning("Campos NÃO encontrados: %s", ausentes)
        yield item

    def on_error(self, failure):
        self.logger.error("Falha na requisição %s: %r", failure.request.url, failure.value)

    # ------------------------------------------------------------------ #
    # Extratores
    # ------------------------------------------------------------------ #
    def _json_ld(self, response):
        """Retorna o primeiro objeto JSON-LD do tipo MusicComposition/MusicRecording/CreativeWork."""
        for bloco in response.css('script[type="application/ld+json"]::text').getall():
            try:
                dados = json.loads(bloco)
            except (ValueError, TypeError):
                continue
            candidatos = dados if isinstance(dados, list) else dados.get("@graph", [dados])
            for obj in candidatos:
                if isinstance(obj, dict) and str(obj.get("@type", "")).startswith(
                    ("Music", "CreativeWork")
                ):
                    return obj
        return {}

    def _titulo(self, response, ld):
        return (
            _limpar(ld.get("name"))
            or _limpar(" ".join(response.css("h1 *::text, h1::text").getall()))
            or _limpar(response.css('meta[property="og:title"]::attr(content)').get())
        )

    def _artista(self, response, ld):
        por_ld = ld.get("byArtist") or ld.get("composer") or ld.get("author")
        if isinstance(por_ld, list) and por_ld:
            por_ld = por_ld[0]
        if isinstance(por_ld, dict):
            por_ld = por_ld.get("name")
        if _limpar(por_ld):
            return _limpar(por_ld)

        # Link para a página do artista: /cifras/{artista} (sem o slug da música)
        partes = urlparse(response.url).path.strip("/").split("/")
        if len(partes) >= 2:
            slug_artista = partes[1]
            for href in (f"/cifras/{slug_artista}", f"/cifras/{slug_artista}/"):
                nome = _limpar(
                    " ".join(response.xpath(
                        f'//a[@href="{href}" or substring(@href, string-length(@href) - string-length("{href}") + 1) = "{href}"]'
                        "[not(ancestor::nav) and not(ancestor::footer)][1]//text()"
                    ).getall())
                )
                if nome:
                    return nome
            # Último recurso: derivar do slug (marcado no log)
            self.logger.info("Artista derivado do slug da URL (fallback).")
            return slug_artista.replace("-", " ").title()
        return None

    def _valor_rotulado(self, response, rotulos):
        """Procura um rótulo textual ('Tom:', 'Capotraste:') e retorna o valor adjacente.

        Aceita tanto 'Tom: G' num único nó quanto '<span>Tom:</span><b>G</b>'.
        """
        textos = [t.strip() for t in response.xpath(_TEXTOS_VISIVEIS).getall()]
        padrao = re.compile(
            r"^(?:%s)\s*:?\s*(.*)$" % "|".join(re.escape(r) for r in rotulos),
            re.IGNORECASE,
        )
        for i, texto in enumerate(textos):
            m = padrao.match(texto)
            if not m:
                continue
            valor = _limpar(m.group(1))
            if not valor and i + 1 < len(textos):
                valor = _limpar(textos[i + 1])
            if valor and len(valor) <= 40:
                return valor
        return None

    def _tom(self, response):
        # 1) atributos de dados comuns em sites de cifra
        attr = response.xpath("//*[@data-key or @data-tom or @data-tone]").xpath(
            "@data-key | @data-tom | @data-tone"
        ).get()
        if attr and ACORDE_RE.match(attr.strip()):
            return attr.strip()
        # 2) rótulo "Tom:"
        valor = self._valor_rotulado(response, ("tom",))
        if valor:
            primeiro = valor.split()[0]
            return primeiro if ACORDE_RE.match(primeiro) else valor
        return None

    def _acordes(self, response):
        """Lista de acordes únicos, na ordem de aparição.

        Prioriza blocos de diagramas/lista de acordes separados da letra.
        Só se não existirem, lê os NOMES dos acordes marcados dentro da cifra
        (<b>, span.chord etc.) — sem guardar a letra.
        """
        fontes = [
            ("atributo data-chord", "//*[@data-chord]/@data-chord"),
            (
                "bloco de acordes separado",
                "//*[contains(concat(' ', translate(@class,'ACORDESCHRD','acordeschrd'), ' '), 'acordes')"
                " or contains(translate(@class,'CHORDS','chords'), 'chords')"
                " or contains(translate(@id,'ACORDESCHRD','acordeschrd'), 'acordes')]"
                "[not(self::pre) and not(ancestor::pre)]//*[not(*)]/text()",
            ),
            ("marcação de acorde na cifra", "//pre//b/text() | //pre//*[contains(@class,'chord') or contains(@class,'acorde')]/text()"),
        ]
        for nome, xpath in fontes:
            vistos = []
            for bruto in response.xpath(xpath).getall():
                acorde = bruto.strip()
                if ACORDE_RE.match(acorde) and acorde not in vistos:
                    vistos.append(acorde)
            if vistos:
                self.logger.info("Acordes obtidos via: %s", nome)
                return vistos
        return None
