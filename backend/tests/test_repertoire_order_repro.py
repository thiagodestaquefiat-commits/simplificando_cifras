"""BUG 2 — músicas de um evento aparecem fora da ordem definida.

Reproduz o fluxo real: evento -> repertório -> persistência (POST/PUT) ->
backend -> pull (GET) -> um segundo "dispositivo" lendo o mesmo evento.
Usa o cliente de teste Flask real contra as rotas reais de
backend/app/routes/events.py, sem simular o comportamento desejado.
"""

from test_event_permissions import auth, register


def _payload_with_repertoire(order_ids):
    songs = {
        "song-a": ("Música A", "Artista A"),
        "song-b": ("Música B", "Artista B"),
        "song-c": ("Música C", "Artista C"),
        "song-d": ("Música D", "Artista D"),
    }
    return {
        "id": "event-order",
        "title": "Culto com ordem conhecida",
        "date": "2026-09-20",
        "time": "19:00",
        "location": "Igreja Central",
        "description": "",
        "leaderId": "order-leader",
        "members": [{"id": "order-leader", "name": "Líder", "role": "Violão"}],
        "repertoire": [
            {
                "id": f"item-{song_id}",
                "songId": song_id,
                "shared": {"title": songs[song_id][0], "artist": songs[song_id][1], "key": "G", "capo": "", "chordSheet": "", "notes": ""},
            }
            for song_id in order_ids
        ],
    }


def _order(body):
    return [item["songId"] for item in body["repertoire"]]


def test_repertoire_order_round_trips_through_create_get_and_reorder(client):
    leader = register(client, "order-leader", "Líder")

    created = client.post(
        "/api/collaboration/events",
        headers=auth(leader),
        json=_payload_with_repertoire(["song-a", "song-b", "song-c", "song-d"]),
    )
    assert created.status_code == 201, created.get_json()
    assert _order(created.get_json()) == ["song-a", "song-b", "song-c", "song-d"], "ordem enviada na criação não foi respeitada"
    assert [item["order"] for item in created.get_json()["repertoire"]] == [0, 1, 2, 3], "campo order deveria refletir a posição 0..N-1"

    # "Segundo dispositivo" lendo o mesmo evento pela primeira vez (pull).
    fetched = client.get("/api/collaboration/events/event-order", headers=auth(leader))
    assert fetched.status_code == 200
    assert _order(fetched.get_json()) == ["song-a", "song-b", "song-c", "song-d"], "GET devolveu ordem diferente da criada"

    # Reordena como um drag-and-drop faria: D, A, C, B — e resalva o evento
    # inteiro (é exatamente o que saveSharedEvent/toRemotePayload envia).
    reorder_payload = _payload_with_repertoire(["song-d", "song-a", "song-c", "song-b"])
    reorder_payload["remoteVersion"] = created.get_json()["remoteVersion"]
    reordered = client.put("/api/collaboration/events/event-order", headers=auth(leader), json=reorder_payload)
    assert reordered.status_code == 200, reordered.get_json()
    assert _order(reordered.get_json()) == ["song-d", "song-a", "song-c", "song-b"], "PUT não persistiu a nova ordem"

    # Um terceiro GET (outro dispositivo, ou reload) precisa ver a MESMA
    # ordem nova — não a original, nem uma ordem diferente reconstruída.
    fetched_again = client.get("/api/collaboration/events/event-order", headers=auth(leader))
    assert _order(fetched_again.get_json()) == ["song-d", "song-a", "song-c", "song-b"], "reload/segundo dispositivo não vê a ordem reordenada"
    assert [item["order"] for item in fetched_again.get_json()["repertoire"]] == [0, 1, 2, 3], "campo order não foi recalculado 0..N-1 após o reorder"


def test_repertoire_order_survives_a_shared_item_patch_that_does_not_touch_order(client):
    # changeEventOfficialKey() (PR #51) usa PATCH .../shared para eventos já
    # sincronizados, sem reenviar o repertório inteiro. Confirma que essa
    # rota não mexe em position/order de nenhum item.
    leader = register(client, "order-leader-2", "Líder")
    created = client.post(
        "/api/collaboration/events",
        headers=auth(leader),
        json={**_payload_with_repertoire(["song-a", "song-b", "song-c", "song-d"]), "id": "event-order-2", "leaderId": "order-leader-2", "members": [{"id": "order-leader-2", "name": "Líder", "role": "Violão"}]},
    )
    assert created.status_code == 201, created.get_json()
    item_b_id = next(item["id"] for item in created.get_json()["repertoire"] if item["songId"] == "song-b")

    patched = client.patch(
        f"/api/collaboration/events/event-order-2/repertoire/{item_b_id}/shared",
        headers=auth(leader),
        json={"remoteVersion": created.get_json()["remoteVersion"], "title": "Música B", "artist": "Artista B", "key": "A", "capo": "2", "chordSheet": "", "notes": ""},
    )
    assert patched.status_code == 200, patched.get_json()
    assert _order(patched.get_json()) == ["song-a", "song-b", "song-c", "song-d"], "PATCH de um item alterou a ordem do repertório"
