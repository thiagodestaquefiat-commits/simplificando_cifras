from app.services.location_provider import LocationProviderError, MapImage


class FakeLocationProvider:
    def search(self, query, limit=5):
        return [{
            "placeId": "place-church-1", "name": "Igreja Central",
            "formattedAddress": "Igreja Central, Rua das Flores, 100, Blumenau, SC, Brasil",
            "street": "Rua das Flores", "streetNumber": "100", "district": "Centro",
            "city": "Blumenau", "state": "Santa Catarina", "postalCode": "89000-000",
            "country": "Brasil", "latitude": -26.9187, "longitude": -49.066,
            "provider": "geoapify",
        }]

    def map_image(self, latitude, longitude, width, height):
        return MapImage(body=b"fake-png", content_type="image/png")


def test_location_search_is_normalized_and_rejects_short_queries(client, app):
    app.extensions["location_provider"] = FakeLocationProvider()
    short = client.get("/api/locations/search?q=abc")
    assert short.status_code == 400
    response = client.get("/api/locations/search?q=Igreja%20Central")
    assert response.status_code == 200
    result = response.get_json()["results"][0]
    assert result["placeId"] == "place-church-1"
    assert result["latitude"] == -26.9187
    assert result["provider"] == "geoapify"


def test_map_proxy_validates_coordinates_and_returns_image(client, app):
    app.extensions["location_provider"] = FakeLocationProvider()
    invalid = client.get("/api/locations/map?latitude=200&longitude=0")
    assert invalid.status_code == 400
    response = client.get("/api/locations/map?latitude=-26.9&longitude=-49.06&width=720&height=320")
    assert response.status_code == 200
    assert response.content_type == "image/png"
    assert response.data == b"fake-png"


def test_provider_failure_is_graceful(client, app):
    class FailingProvider(FakeLocationProvider):
        def search(self, query, limit=5):
            raise LocationProviderError("Serviço indisponível para teste.")

    app.extensions["location_provider"] = FailingProvider()
    response = client.get("/api/locations/search?q=Igreja")
    assert response.status_code == 503
    assert response.get_json()["erro"]["codigo"] == "provedor_localizacao_indisponivel"
