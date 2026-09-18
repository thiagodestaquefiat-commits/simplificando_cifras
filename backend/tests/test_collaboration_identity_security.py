"""C1: POST /api/collaboration/users não pode aceitar um `id` escolhido pelo
cliente no formato de UUID canônico — esse é o formato que o Supabase usa
para `subject`, e aceitar-lo permite que alguém registre antecipadamente um
CollaborationUser com esse id, na esperança de que ele coincida com o
`subject` de uma conta Supabase real que ainda vai logar pela primeira vez
(collaboration_auth.py reaproveita `subject` como `user_id` quando não existe
ExternalIdentity ainda).

Este arquivo não mexe em collaboration_auth.py/ExternalIdentity: só confirma
que, depois da correção em register_user, esse caminho de ataque deixa de
existir, e que os formatos de id usados hoje pelo ROUDY continuam livres.
"""

from app.database import db
from app.models import CollaborationUser, ExternalIdentity, UserAccessToken

from test_event_permissions import auth, register


CANONICAL_UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"


def test_register_user_rejects_uuid_shaped_id(client):
    response = client.post(
        "/api/collaboration/users",
        json={"id": CANONICAL_UUID, "name": "Atacante"},
    )
    assert response.status_code == 400, response.get_json()
    assert response.get_json()["erro"]["codigo"] == "identificador_reservado"


def test_register_user_rejects_uppercase_uuid_shaped_id(client):
    response = client.post(
        "/api/collaboration/users",
        json={"id": CANONICAL_UUID.upper(), "name": "Atacante"},
    )
    assert response.status_code == 400, response.get_json()
    assert response.get_json()["erro"]["codigo"] == "identificador_reservado"


def test_register_user_still_accepts_free_form_ids(client, app):
    # Mesmos formatos usados hoje em produção e no resto da suíte: nome
    # livre (helper `register`) e o prefixo real do cliente (`user_`+hex).
    register(client, "leader-user", "Líder")
    response = client.post(
        "/api/collaboration/users",
        json={"id": "user_" + "a" * 32, "name": "Dispositivo local"},
    )
    assert response.status_code == 201, response.get_json()
    with app.app_context():
        assert db.session.get(CollaborationUser, "leader-user") is not None
        assert db.session.get(CollaborationUser, "user_" + "a" * 32) is not None


def test_uuid_squatting_blocked_before_real_supabase_login(client, app):
    class FakeSupabase:
        enabled = True

        def validate(self, token):
            assert token == "supabase-token"
            return {"id": CANONICAL_UUID, "email": "vitima@example.com", "user_metadata": {"full_name": "Vítima"}}

    # 1) o atacante tenta reservar o id antes da vítima logar — bloqueado.
    squat = client.post(
        "/api/collaboration/users",
        json={"id": CANONICAL_UUID, "name": "Atacante"},
    )
    assert squat.status_code == 400, squat.get_json()

    # 2) a vítima loga de verdade pela primeira vez com esse `subject`.
    app.extensions["supabase_auth"] = FakeSupabase()
    me = client.get("/api/collaboration/me", headers=auth("supabase-token"))
    assert me.status_code == 200, me.get_json()
    assert me.get_json()["id"] == CANONICAL_UUID

    with app.app_context():
        user = db.session.get(CollaborationUser, CANONICAL_UUID)
        assert user is not None
        assert user.name == "Vítima"
        identity = ExternalIdentity.query.filter_by(provider="supabase", subject=CANONICAL_UUID).first()
        assert identity is not None and identity.user_id == CANONICAL_UUID
        # nenhum token de atacante foi criado para esse user_id — a única
        # linha em UserAccessToken (se houver) não veio do squat bloqueado.
        assert UserAccessToken.query.filter_by(user_id=CANONICAL_UUID).count() == 0
