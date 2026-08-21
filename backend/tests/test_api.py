from unittest.mock import patch

from app.schemas.resumo_harmonico import ResumoHarmonicoResponse, TrechoHarmonico


def sample_result():
    return ResumoHarmonicoResponse(
        schemaVersion=1,
        titulo="Canção teste",
        artista=None,
        tom="Db",
        trechos=[
            TrechoHarmonico(
                acordes=["Db", "B4", "Gb/Bb"],
                repeticoes=2,
                fraseGuia="Uma frase curta para reconhecer",
                secao=None,
            )
        ],
        observacoes=[],
        confianca="alta",
    )


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_text_request_returns_versioned_json(generate, client):
    generate.return_value = sample_result()
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "texto", "titulo": "Canção teste", "conteudo": "Db B4 Gb/Bb"},
        headers={"Origin": "http://localhost:5500"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["schemaVersion"] == 1
    assert data["tom"] == "Db"
    assert data["trechos"][0]["acordes"] == ["Db", "Bsus4", "Gb/Bb"]
    assert data["trechos"][0]["repeticoes"] == 2
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Request-ID"]


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_research_caps_confidence_and_adds_warning(generate, client):
    generate.return_value = sample_result()
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "pesquisa", "titulo": "Canção teste"},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["confianca"] == "media"
    assert any("podem precisar de correção" in item for item in data["observacoes"])


def test_rejects_invalid_input_without_calling_provider(client):
    response = client.post("/api/resumo-harmonico", json={"tipo": "pesquisa"})
    assert response.status_code == 400
    assert response.is_json
    assert response.get_json()["erro"]["codigo"] == "entrada_invalida"


def test_rejects_non_json(client):
    response = client.post(
        "/api/resumo-harmonico",
        data="texto",
        content_type="text/plain",
    )
    assert response.status_code == 415
    assert response.get_json()["erro"]["codigo"] == "content_type_invalido"


def test_rejects_malformed_json_with_json_error(client):
    response = client.post(
        "/api/resumo-harmonico",
        data="{",
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.is_json
    assert response.get_json()["erro"]["codigo"] == "entrada_invalida"


def test_cors_is_not_wildcard(client):
    allowed = client.options(
        "/api/resumo-harmonico",
        headers={
            "Origin": "http://localhost:5500",
            "Access-Control-Request-Method": "POST",
        },
    )
    denied = client.options(
        "/api/resumo-harmonico",
        headers={
            "Origin": "https://malicioso.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    preview = client.options(
        "/api/resumo-harmonico",
        headers={
            "Origin": "https://deploy-preview-123--simplificandocifras.netlify.app",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert allowed.headers["Access-Control-Allow-Origin"] == "http://localhost:5500"
    assert preview.headers["Access-Control-Allow-Origin"] == "https://deploy-preview-123--simplificandocifras.netlify.app"
    assert "Access-Control-Allow-Origin" not in denied.headers


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_rate_limit_returns_standard_json(generate, app, client):
    generate.return_value = sample_result()
    app.config["RESUMO_RATE_LIMIT"] = "1 per minute"
    payload = {"tipo": "pesquisa", "titulo": "Canção teste"}

    first = client.post("/api/resumo-harmonico", json=payload)
    second = client.post("/api/resumo-harmonico", json=payload)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.is_json
    assert second.get_json()["erro"]["codigo"] == "limite_excedido"
