"""Execute: cd backend; python -m voice_assistant"""

from datetime import datetime, timedelta
import json
from zoneinfo import ZoneInfo

from .actions import create_default_manager
from .events import Event, EventService


def main():
    now = datetime.now(ZoneInfo("America/Sao_Paulo"))
    # Datas relativas mantêm o exemplo válido independentemente do dia de execução.
    mock_database = [
        Event(1, "Ensaio que já passou", now - timedelta(days=2)),
        Event(8, "Evento da semana que vem", now + timedelta(days=7)),
        Event(4, "Ensaio mais próximo", now + timedelta(hours=2)),
        Event(9, "Ensaio de amanhã", now + timedelta(days=1)),
    ]
    manager = create_default_manager(EventService(mock_database, clock=lambda: now))
    samples = [
        "abrir próximo evento", "me mostra o próximo evento",
        "cara, abre aí o evento que tá mais perto", "abre o proximo evnto",
        "o que tem amanhã", "mostre o afinador por favor",
        "quero abrir as configurações", "não abra o próximo evento",
        "qual a previsão do tempo?",
    ]
    for text in samples:
        result = manager.handle(text)
        print(json.dumps({"entrada": text, "resultado": result}, ensure_ascii=False, indent=2))
    nearest = manager.handle(samples[2])
    assert nearest["intent"] == "INTENT_PROXIMO_EVENTO"
    assert nearest["params"] == {"evento_id": 4}
    assert nearest["action"] == "navigate"
    print("\nVerificado: intenção correta, evento futuro ID 4 e payload de navegação.")


if __name__ == "__main__":
    main()
