import base64
import io

from PIL import Image

from app.database import db
from app.models import ProfileAvatar


def picture(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def register(client, name):
    response = client.post("/api/collaboration/users", json={"id": name, "name": name})
    assert response.status_code == 201
    return {"Authorization": "Bearer " + response.json["accessToken"]}


def test_photo_survives_new_requests_and_is_owned_by_account(client, app):
    a, b = register(client, "photo-a"), register(client, "photo-b")
    response = client.patch("/api/collaboration/me/avatar", headers=a, json={"avatarUrl": picture(), "userId": "photo-b"})
    assert response.status_code == 200
    saved = response.json["avatarUrl"]
    assert saved.startswith("data:image/jpeg;base64,")
    assert client.get("/api/collaboration/me", headers=a).json["avatarUrl"] == saved
    assert client.get("/api/collaboration/me", headers=b).json["avatarUrl"] is None
    with app.app_context():
        assert db.session.get(ProfileAvatar, "photo-a").data_url == saved
        assert db.session.get(ProfileAvatar, "photo-b") is None
    changed = client.patch("/api/collaboration/me/avatar", headers=a, json={"avatarUrl": picture("blue")})
    assert changed.json["avatarUrl"] != saved
    assert client.get("/api/collaboration/me", headers=a).json["avatarUrl"] == changed.json["avatarUrl"]


def test_google_refresh_does_not_replace_custom_photo_or_explicit_removal(client, app):
    class Google:
        enabled = True
        def validate(self, token):
            return {"id": "google-photo-user", "email": "a@example.com", "user_metadata": {"full_name": "A", "picture": "https://example.com/google.jpg"}}
    app.extensions["supabase_auth"] = Google()
    headers = {"Authorization": "Bearer google-token"}
    assert client.get("/api/collaboration/me", headers=headers).json["avatarUrl"] == "https://example.com/google.jpg"
    saved = client.patch("/api/collaboration/me/avatar", headers=headers, json={"avatarUrl": picture()}).json["avatarUrl"]
    assert client.get("/api/collaboration/me", headers=headers).json["avatarUrl"] == saved
    assert client.patch("/api/collaboration/me/avatar", headers=headers, json={"avatarUrl": None}).status_code == 200
    current = client.get("/api/collaboration/me", headers=headers).json
    assert current["avatarSet"] is True and current["avatarUrl"] is None


def test_invalid_images_do_not_overwrite_saved_photo(client):
    headers = register(client, "photo-invalid")
    saved = client.patch("/api/collaboration/me/avatar", headers=headers, json={"avatarUrl": picture()}).json["avatarUrl"]
    for value in ["javascript:alert(1)", "https://example.com/untrusted.jpg", "data:image/png;base64,YWJj", {}, "data:image/svg+xml;base64,YWJj"]:
        assert client.patch("/api/collaboration/me/avatar", headers=headers, json={"avatarUrl": value}).status_code == 400
    assert client.patch("/api/collaboration/me/avatar", json={"avatarUrl": picture()}).status_code == 401
    assert client.get("/api/collaboration/me", headers=headers).json["avatarUrl"] == saved
