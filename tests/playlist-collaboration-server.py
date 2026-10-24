"""Disposable HTTP fixture. In-memory test DB; never reads production accounts."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend/tests"))
from app import create_app
from conftest import TestConfig
from werkzeug.serving import make_server
from app.database import db
from app.models import UserHandle, ProfileAvatar, ExternalIdentity

app = create_app(TestConfig)
with app.test_client() as client:
    tokens = {}
    for user, name in [("test-ana", "Ana"), ("test-bruno", "Bruno"), ("test-carol", "Carol")]:
        response = client.post("/api/collaboration/users", json={"id": user, "name": name})
        assert response.status_code == 201
        tokens[user] = "fixture-signed-" + user
with app.app_context():
    for user in tokens:
        db.session.add(ExternalIdentity(provider="supabase", subject=user, user_id=user))
        db.session.add(UserHandle(user_id=user, username=user.replace("test-", "")))
        db.session.add(ProfileAvatar(user_id=user, data_url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII="))
    db.session.commit()
class FixtureAuth:
    def validate(self, token):
        user = next((user for user, known in tokens.items() if known == token), None)
        return {"id": user, "user_metadata": {"full_name": user.replace("test-", "").title()}} if user else None
app.extensions["supabase_auth"] = FixtureAuth()
server = make_server("127.0.0.1", 0, app, threaded=False)
print(json.dumps({"port": server.server_port, "tokens": tokens}), flush=True)
server.serve_forever()
