import base64
import json

from PIL import Image


def _token():
    payload = {
        "title": "Culto Especial",
        "date": "21 de set de 2026",
        "time": "19:00",
        "location": "Bnu",
        "musicas": [{"title": "A alegria", "artist": "MORADA"}],
    }
    return base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()


def test_event_share_page_exposes_open_graph_and_redirect(client):
    response = client.get("/share/event", query_string={"share": _token()})
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'property="og:title" content="Culto Especial"' in html
    assert 'property="og:image"' in html
    assert "simplificandocifras.netlify.app/?share=" in html


def test_event_share_image_is_full_bleed_square_png(client):
    response = client.get("/share/event/image", query_string={"share": _token()})
    assert response.status_code == 200
    assert response.mimetype == "image/png"
    image = Image.open(__import__("io").BytesIO(response.data))
    assert image.size == (1200, 1200)
    assert image.mode == "RGB"
    assert image.getpixel((0, 0)) != (255, 255, 255)
