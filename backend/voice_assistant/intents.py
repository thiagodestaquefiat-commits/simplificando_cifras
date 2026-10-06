"""Exemplos declarativos. Acrescente dados aqui e um handler no gerenciador."""

from .nlu import IntentDefinition

INTENTS = (
    IntentDefinition("INTENT_PROXIMO_EVENTO", (
        "abrir próximo evento", "me mostra o próximo evento",
        "evento mais perto", "abrir evento mais próximo", "qual o próximo evento",
        "abrir o evento futuro mais próximo", "mostrar próximo compromisso",
    ), (("evento", "compromisso"), ("proximo", "perto"))),
    IntentDefinition("INTENT_EVENTOS_AMANHA", (
        "o que tem amanhã", "abrir evento de amanhã", "eventos amanhã",
        "mostrar agenda de amanhã", "quais os compromissos de amanhã",
    ), (("amanha",),)),
    IntentDefinition("INTENT_EVENTOS_HOJE", (
        "o que tem hoje", "abrir evento de hoje", "eventos hoje",
        "mostrar agenda de hoje", "quais os compromissos de hoje",
    ), (("hoje",),)),
    IntentDefinition("INTENT_AFINADOR", (
        "abrir afinador", "mostrar afinador", "quero afinar minha guitarra",
        "afinar violão", "ferramenta afinador",
    ), (("afinador", "afinar"),)),
    IntentDefinition("INTENT_METRONOMO", (
        "abrir metrônomo", "mostrar metrônomo", "ferramenta metrônomo",
    ), (("metronomo",),)),
    IntentDefinition("INTENT_CONFIGURACOES", (
        "abrir configurações", "mostrar configurações", "abrir ajustes do aplicativo",
    ), (("configuracoes",),)),
    IntentDefinition("INTENT_PLAYLIST", (
        "abrir playlist", "mostrar minhas músicas", "ir para minha playlist",
        "abrir biblioteca", "mostrar biblioteca musical",
    ), (("playlist", "biblioteca", "musicas"),)),
)
