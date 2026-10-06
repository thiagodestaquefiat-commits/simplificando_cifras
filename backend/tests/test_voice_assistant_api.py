from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from voice_assistant.api import resolve_snapshot
from voice_assistant.export_catalog import javascript


def test_catalog_generated_from_python():
    path = Path(__file__).resolve().parents[2] / 'js' / 'assistant-intent-catalog.js'
    assert path.read_text(encoding='utf-8').strip() == javascript().strip()


def test_anonymous_stateless_route_uses_only_caller_context(client):
    now = datetime.now(timezone.utc)
    response = client.post('/api/assistant/resolve', json={
        'text': 'cara, abre aí o evento que tá mais perto',
        'events': [{'id': 0, 'startsAt': (now - timedelta(days=1)).isoformat()},
                   {'id': 1, 'startsAt': (now + timedelta(days=1)).isoformat()}],
    })
    assert response.status_code == 200
    result = response.get_json()
    assert result['engine'] == 'python' and result['params'] == {'evento_id': 1}
    assert response.headers['Cache-Control'] == 'no-store'
    # Nenhum nome, UID, email ou evento do banco é buscado/exposto por esta API.
    assert client.post('/api/assistant/resolve', json={'text': 'próximo evento'}).get_json()['action'] == 'inform'


@pytest.mark.parametrize('data', [None, [], {}, {'text': 'a'*501},
    {'text': 'afinador', 'events': [{}]}, {'text': 'afinador', 'timezone': '../../etc/passwd'},
    {'text': 'afinador', 'events': [{'id': 'uid-real', 'startsAt': '2026-10-06T12:00:00Z'}]},
    {'text': 'afinador', 'events': [{'id': True, 'startsAt': '2026-10-06T12:00:00Z'}]},
    {'text': 'afinador', 'events': [{'id': 0, 'startsAt': '2026-10-06T12:00:00'}]},
    {'text': 'afinador', 'events': [None]*251}])
def test_input_validation(client, data):
    assert client.post('/api/assistant/resolve', json=data).status_code == 400


def test_snapshot_dates_and_negation():
    now = datetime(2026, 10, 6, 15, tzinfo=timezone.utc)
    result = resolve_snapshot({'text': 'não abra o afinador'}, clock=lambda: now)
    assert result['action'] == 'clarify' and result['params']['reason'] == 'negated_command'
