"""Roteador declarativo. Produz ações; não modifica banco nem navega sozinho."""

from typing import Callable

from .events import Event, EventService
from .intents import INTENTS
from .nlu import IntentClassifier, normalize

Handler = Callable[[str], dict]


def event_payload(events: list[Event], empty_message: str) -> dict:
    if not events:
        return {"action": "inform", "screen": None, "params": {}, "message": empty_message}
    if len(events) == 1:
        event = events[0]
        return {"action": "navigate", "screen": "detalhes_evento",
                "params": {"evento_id": event.id}, "message": f"Abrindo {event.name}."}
    return {"action": "choose", "screen": "eventos", "params": {
        "eventos": [{"evento_id": e.id, "nome": e.name, "data": e.starts_at.isoformat()}
                    for e in events]}, "message": "Encontrei mais de um evento. Qual deseja abrir?"}


class ActionManager:
    def __init__(self, classifier: IntentClassifier):
        self.classifier = classifier
        self.handlers: dict[str, Handler] = {}

    def register(self, intent: str):
        def decorate(handler: Handler) -> Handler:
            if intent in self.handlers:
                raise ValueError(f"Handler duplicado: {intent}")
            self.handlers[intent] = handler
            return handler
        return decorate

    def handle(self, text: str) -> dict:
        match = self.classifier.classify(text)
        metadata = {"intent": match.intent, "confidence": match.confidence}
        if match.intent is None:
            return {"action": "clarify", "screen": None,
                    "params": {"reason": match.reason, "alternatives": list(match.alternatives)},
                    "message": "Não tenho certeza do pedido. Diga uma ação de cada vez.", **metadata}
        handler = self.handlers.get(match.intent)
        if handler is None:
            return {"action": "inform", "screen": None, "params": {"reason": "unhandled_intent"},
                    "message": "Esta ação ainda não está disponível.", **metadata}
        try:
            payload = handler(text)
        except Exception:
            # Nunca retorna traceback, credenciais, texto cru nem dados do usuário.
            return {"action": "inform", "screen": None, "params": {"reason": "action_failed"},
                    "message": "Não consegui executar essa ação agora.", **metadata}
        return {**payload, **metadata}


def create_default_manager(events: EventService) -> ActionManager:
    manager = ActionManager(IntentClassifier(INTENTS))

    @manager.register("INTENT_PROXIMO_EVENTO")
    def next_event(_text):
        return event_payload(events.next_events(), "Você não possui eventos futuros.")

    @manager.register("INTENT_EVENTOS_AMANHA")
    def tomorrow(_text):
        return event_payload(events.on_day(1), "Você não possui eventos amanhã.")

    @manager.register("INTENT_EVENTOS_HOJE")
    def today(_text):
        return event_payload(events.on_day(0), "Você não possui eventos hoje.")

    # Navegação comum definida por dados, sem árvore if/elif por tela.
    for intent, screen in {
        "INTENT_AFINADOR": "afinador", "INTENT_METRONOMO": "metronomo",
        "INTENT_CONFIGURACOES": "configuracoes", "INTENT_PLAYLIST": "playlist",
    }.items():
        def navigate(text, target=screen):
            # Abrir a tela não deve ligar/parar ferramenta por engano.
            tokens = set(normalize(text).split())
            if tokens & {"iniciar", "ligar", "ligue", "liga", "ativar", "ative", "ativa",
                         "parar", "pare", "pausar", "interromper", "desligar", "bpm"}:
                return {"action": "clarify", "screen": None, "params": {"reason": "unsupported_operation"},
                        "message": "Este módulo reconhece abrir a ferramenta, não seus controles internos."}
            return {"action": "navigate", "screen": target, "params": {},
                    "message": "Abrindo a tela solicitada."}
        manager.register(intent)(navigate)
    return manager
