from unittest.mock import patch
from io import BytesIO
import uuid
from datetime import datetime, timezone

import pytest

from app.schemas.resumo_harmonico import ResumoEstruturado, ResumoHarmonicoResponse, TrechoHarmonico
from app.services.providers import (
    ProviderInvalidResponse,
    ProviderRateLimit,
    ProviderRequestRejected,
    ProviderStructuredResponseError,
    ProviderTimeout,
    ProviderUnavailable,
)
from app.services.music_sources import MusicSourceCandidate, MusicSourceResult, MusicSourceTimeout, MusicSourceUnavailable


def sample_result():
    return ResumoHarmonicoResponse(
        schemaVersion=2,
        titulo="Canção teste",
        artista=None,
        tom="Db",
        harmonicSummary=ResumoEstruturado(blocos=[TrechoHarmonico(
                acordes=["Db", "B4", "Gb/Bb"],
                repeticoes=2,
                fraseGuia="Uma frase curta para reconhecer",
                secao=None,
            )]),
        observacoes=[],
        confianca="alta",
    )


def auth_headers(client, **extra):
    user_id = f"ai-user-{uuid.uuid4()}"
    registered = client.post("/api/collaboration/users", json={"id": user_id, "name": "Usuário IA"})
    assert registered.status_code == 201
    return {"Authorization": f"Bearer {registered.get_json()['accessToken']}", **extra}


class FakeMusicSourceRegistry:
    def __init__(self, *, candidates=None, result=None, error=None):
        self.candidates = candidates or []
        self.result = result
        self.error = error

    def search(self, title, artist=None):
        if self.error:
            raise self.error
        return self.candidates

    def fetch(self, provider_id, source_id):
        if self.error:
            raise self.error
        return self.result


def selected_source_result():
    return MusicSourceResult(
        "licensed", "studio", "Fonte licenciada", "https://licensed.example/song",
        "Canção teste", "Artista teste", "Db B4 Gb/Bb\nUma frase curta para reconhecer",
        "lyrics_chords", datetime.now(timezone.utc),
    )


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_text_request_returns_versioned_json(generate, client):
    generate.return_value = sample_result()
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "texto", "titulo": "Canção teste", "conteudo": "Db B4 Gb/Bb"},
        headers=auth_headers(client, Origin="http://localhost:5500"),
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["schemaVersion"] == 2
    assert data["tom"] == "Db"
    assert data["harmonicSummary"]["blocos"][0]["acordes"] == ["Db", "Bsus4", "Gb/Bb"]
    assert data["harmonicSummary"]["blocos"][0]["repeticoes"] == 2
    assert data["fullChordSheet"] == {
        "visibility": "private",
        "source": "user_text",
        "content": "Db B4 Gb/Bb",
        "sections": [],
    }
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Request-ID"]
    assert generate.call_args.kwargs["context"]["request_id"] == response.headers["X-Request-ID"]


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_research_caps_confidence_and_adds_warning(generate, client):
    generate.return_value = sample_result()
    client.application.extensions["music_source_registry"] = FakeMusicSourceRegistry(result=selected_source_result())
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "pesquisa", "titulo": "Canção teste", "artista": "Artista teste", "sourceProvider": "licensed", "sourceId": "studio"},
        headers=auth_headers(client),
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["fullChordSheet"]["content"].startswith("Db B4 Gb/Bb")
    assert data["harmonicSummary"]["blocos"][0]["fraseGuia"] == "Uma frase curta para reconhecer"
    assert generate.call_count == 1


def test_research_requires_explicit_source_selection(client):
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "pesquisa", "titulo": "Canção teste"},
        headers=auth_headers(client),
    )
    assert response.status_code == 400
    assert response.get_json()["erro"]["codigo"] == "fonte_nao_selecionada"


def test_source_search_returns_ranked_options_without_content(client):
    candidate = MusicSourceCandidate("licensed", "studio", "Fonte licenciada", "https://licensed.example/song", "Canção teste", "Artista teste", "lyrics_chords", .98)
    client.application.extensions["music_source_registry"] = FakeMusicSourceRegistry(candidates=[candidate])
    response = client.post(
        "/api/music-sources/search", json={"titulo": "Canção teste", "artista": "Artista teste"}, headers=auth_headers(client),
    )
    assert response.status_code == 200
    assert response.get_json()["candidates"][0]["sourceId"] == "studio"
    assert "content" not in response.get_data(as_text=True)


@pytest.mark.parametrize(("error", "status", "code"), [
    (MusicSourceTimeout("slow"), 504, "fonte_timeout"),
    (MusicSourceUnavailable("offline"), 503, "fonte_indisponivel"),
])
def test_source_search_classifies_failures(error, status, code, client):
    client.application.extensions["music_source_registry"] = FakeMusicSourceRegistry(error=error)
    response = client.post("/api/music-sources/search", json={"titulo": "Canção"}, headers=auth_headers(client))
    assert response.status_code == status
    assert response.get_json()["erro"]["codigo"] == code


def test_rejects_invalid_input_without_calling_provider(client):
    response = client.post("/api/resumo-harmonico", json={"tipo": "pesquisa"}, headers=auth_headers(client))
    assert response.status_code == 400
    assert response.is_json
    assert response.get_json()["erro"]["codigo"] == "entrada_invalida"


def test_requires_authenticated_user(client):
    response = client.post("/api/resumo-harmonico", json={"tipo": "pesquisa", "titulo": "Canção teste"})
    assert response.status_code == 401
    assert response.get_json()["erro"]["codigo"] == "autenticacao_necessaria"


def test_rejects_non_json(client):
    response = client.post(
        "/api/resumo-harmonico",
        data="texto",
        content_type="text/plain",
        headers=auth_headers(client),
    )
    assert response.status_code == 415
    assert response.get_json()["erro"]["codigo"] == "content_type_invalido"


def test_rejects_malformed_json_with_json_error(client):
    response = client.post(
        "/api/resumo-harmonico",
        data="{",
        content_type="application/json",
        headers=auth_headers(client),
    )
    assert response.status_code == 400
    assert response.is_json
    assert response.get_json()["erro"]["codigo"] == "entrada_invalida"


@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_txt_upload_returns_same_structured_contract(generate, client):
    generate.return_value = sample_result()
    response = client.post(
        "/api/resumo-harmonico",
        data={
            "titulo": "Canção teste",
            "arquivo": (BytesIO(b"Tom: Db\nDb B4 Gb/Bb"), "cifra.txt", "text/plain"),
        },
        content_type="multipart/form-data",
        headers=auth_headers(client),
    )
    assert response.status_code == 200
    assert response.get_json()["schemaVersion"] == 2
    assert response.get_json()["fullChordSheet"] == {
        "visibility": "private",
        "source": "user_upload",
        "content": "Tom: Db\nDb B4 Gb/Bb",
        "sections": [],
    }
    assert generate.call_args.args[2] is None


def test_upload_requires_file(client):
    response = client.post("/api/resumo-harmonico", data={"titulo": "Sem arquivo"}, content_type="multipart/form-data", headers=auth_headers(client))
    assert response.status_code == 400
    assert response.get_json()["erro"]["codigo"] == "arquivo_obrigatorio"


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
    payload = {"tipo": "texto", "conteudo": "Db B4 Gb/Bb"}

    headers = auth_headers(client)
    first = client.post("/api/resumo-harmonico", json=payload, headers=headers)
    second = client.post("/api/resumo-harmonico", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.is_json
    assert second.get_json()["erro"]["codigo"] == "limite_excedido"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (ProviderTimeout("timeout"), 504, "provedor_timeout"),
        (ProviderRateLimit("rate"), 429, "provedor_rate_limit"),
        (ProviderRequestRejected("rejected"), 422, "provedor_rejeitou_requisicao"),
        (ProviderStructuredResponseError("parse"), 502, "resposta_estruturada_invalida"),
        (ProviderInvalidResponse("invalid"), 502, "resposta_provedor_invalida"),
        (ProviderUnavailable("offline"), 503, "provedor_indisponivel"),
    ],
)
@patch("app.services.providers.openai_provider.OpenAIProvider.generate")
def test_provider_errors_are_publicly_classified(generate, error, status, code, client):
    generate.side_effect = error
    response = client.post(
        "/api/resumo-harmonico",
        json={"tipo": "texto", "conteudo": "C G"},
        headers=auth_headers(client),
    )

    assert response.status_code == status
    assert response.get_json()["erro"]["codigo"] == code
    assert response.get_json()["erro"]["requestId"] == response.headers["X-Request-ID"]
    assert "traceback" not in response.get_data(as_text=True).lower()
