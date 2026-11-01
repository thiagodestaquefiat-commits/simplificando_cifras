import base64
import io
from PIL import Image
from test_event_permissions import auth, register

URL = "/api/collaboration/me/cover"


def image():
    buffer = io.BytesIO()
    Image.new("RGB", (800, 400), "blue").save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def test_account_cover_and_position(client):
    assert client.get(URL).status_code == 401
    assert client.put(URL, json={}).status_code == 401
    a, b = register(client, "cover-a", "A"), register(client, "cover-b", "B")
    assert client.get(URL, headers=auth(a)).get_json()["version"] == 0
    body = {"coverImage": image(), "position": {"x": 0, "y": 100}, "baseVersion": 0}
    saved = client.put(URL, headers=auth(a), json=body)
    assert saved.status_code == 200
    data = saved.get_json()
    assert data["version"] == 1
    raw = base64.b64decode(data["coverImage"].split(",")[1])
    assert Image.open(io.BytesIO(raw)).size == (800, 400), "não usa o recorte de avatar 256x256"
    assert client.get(URL, headers=auth(a)).get_json() == data
    assert client.get(URL, headers=auth(b)).get_json()["coverImage"] is None
    assert client.put(URL, headers=auth(a), json=body).status_code == 409
    body.update(coverImage=None, baseVersion=1)
    assert client.put(URL, headers=auth(a), json=body).status_code == 200
    assert client.get(URL, headers=auth(a)).get_json()["coverImage"] is None
    assert client.get(URL, headers=auth(a)).get_json()["version"] == 2


def test_invalid_cover(client):
    token = register(client, "cover-valid", "V")
    for content in ([], {}, {"baseVersion": 0, "coverImage": "https://other.test/a.jpg", "position": {"x": 0, "y": 0}},
                    {"baseVersion": 0, "coverImage": None, "position": {"x": True, "y": 0}},
                    {"baseVersion": 0, "coverImage": None, "position": {"x": -1, "y": 0}}):
        assert client.put(URL, headers=auth(token), json=content).status_code == 400
