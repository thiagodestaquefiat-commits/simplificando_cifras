import scrapy


class MusicaMetadadosItem(scrapy.Item):
    """Somente metadados. Letra e cifra completas NÃO são armazenadas."""

    titulo = scrapy.Field()
    artista = scrapy.Field()
    dificuldade = scrapy.Field()
    tom = scrapy.Field()
    capotraste = scrapy.Field()
    acordes = scrapy.Field()
    url_origem = scrapy.Field()
    coletado_em = scrapy.Field()
    http_status = scrapy.Field()
    campos_ausentes = scrapy.Field()
