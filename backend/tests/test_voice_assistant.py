from datetime import datetime, timedelta, timezone
import json

import pytest

from voice_assistant import Event, EventService, IntentClassifier, IntentDefinition, create_default_manager


NOW = datetime(2026, 10, 6, 15, tzinfo=timezone.utc)


def manager(events=None):
    default = [Event(1, "Passado", NOW - timedelta(seconds=1)),
               Event(7, "Distante", NOW + timedelta(days=7)),
               Event(4, "Mais próximo", NOW + timedelta(hours=1))]
    return create_default_manager(EventService(default if events is None else events, clock=lambda: NOW))


@pytest.mark.parametrize("text", ["abrir próximo evento", "me mostra o próximo evento",
                                   "cara, abre aí o evento que tá mais perto", "abre o proximo evnto",
                                   "ROUDY, por favor me mostra o próximo evento"])
def test_natural_next_event(text):
    result = manager().handle(text)
    assert result["intent"] == "INTENT_PROXIMO_EVENTO"
    assert result["action"] == "navigate" and result["params"] == {"evento_id": 4}
    assert json.loads(json.dumps(result)) == result


def test_empty_and_all_past():
    for events in [[], [Event(1, "Ontem", NOW - timedelta(days=1))]]:
        result = manager(events).handle("próximo evento")
        assert result["action"] == "inform" and result["screen"] is None


def test_timezone_tomorrow_is_not_next_event():
    # UTC 01:00 do dia 7 ainda é dia 6 às 22h em São Paulo.
    events = [Event(4, "Mais próximo hoje", NOW + timedelta(hours=1)),
              Event(5, "Hoje à noite", datetime(2026, 10, 7, 1, tzinfo=timezone.utc)),
              Event(6, "Amanhã", datetime(2026, 10, 7, 12, tzinfo=timezone.utc))]
    app = manager(events)
    assert app.handle("o que tem amanhã")["params"] == {"evento_id": 6}
    assert app.handle("próximo evento")["params"] == {"evento_id": 4}
    assert app.handle("o que tem hoje")["action"] == "choose"


def test_ties_and_now_boundary():
    result = manager([Event(8, "A", NOW), Event(4, "B", NOW)]).handle("próximo evento")
    assert result["action"] == "choose"
    assert [e["evento_id"] for e in result["params"]["eventos"]] == [4, 8]


@pytest.mark.parametrize("text", ["não abra o próximo evento", "qual a previsão do tempo?",
                                   "", "evento do dia 20", "abrir conta bancária",
                                   "abrir afinador e depois abrir evento", "abrir metrônomo e afinador"])
def test_no_unsafe_guess(text):
    assert manager().handle(text)["action"] == "clarify"


@pytest.mark.parametrize("text,screen", [("mostra o afinador", "afinador"),
                                         ("abrir metronomo", "metronomo"),
                                         ("quero abrir os ajustes", "configuracoes"),
                                         ("abrir minha playlist", "playlist")])
def test_navigation(text, screen):
    assert manager().handle(text)["screen"] == screen


def test_ambiguous_classifier_and_extension():
    nlu = IntentClassifier([IntentDefinition("A", ("abrir teste",)),
                            IntentDefinition("B", ("abrir teste",))])
    assert nlu.classify("abrir teste").reason == "ambiguous"
    app = manager()
    app.classifier.register(IntentDefinition("INTENT_AJUDA", ("abrir ajuda",)))

    @app.register("INTENT_AJUDA")
    def help_action(_text):
        return {"action": "navigate", "screen": "ajuda", "params": {}, "message": "Abrindo ajuda."}

    assert app.handle("abrir ajuda")["screen"] == "ajuda"
    with pytest.raises(ValueError):
        app.register("INTENT_AJUDA")(help_action)


def test_errors_dont_leak_secrets():
    app = manager()
    app.handlers["INTENT_PROXIMO_EVENTO"] = lambda _: (_ for _ in ()).throw(RuntimeError("token-secret"))
    assert "token-secret" not in json.dumps(app.handle("próximo evento"))
    with pytest.raises(ValueError):
        Event(1, "Sem fuso", datetime(2026, 10, 6))
