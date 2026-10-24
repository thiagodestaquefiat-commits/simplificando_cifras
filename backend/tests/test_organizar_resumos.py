"""Organizar resumos da biblioteca no padrão ROUDY (frase-guia + uma volta + repetições)."""
from tests.test_api import auth_headers

SHEET = """[Intro] Fm  Db9  Fm/C  Db9

[Primeira Parte]

Fm         Db9
Primeira linha do verso aqui
Fm/C          Db9
Segunda linha do verso

[Refrão]

Bbm      Db9       Fm   Cm
Linha do refrão número um
Bbm      Db9       Fm   Eb
Linha do refrão número dois
"""


def test_song_without_guides_is_rebuilt_from_saved_sheet(client):
    response = client.post("/api/resumo-harmonico/organizar", headers=auth_headers(client), json={"musicas": [{
        "id": "cancao-1", "titulo": "Canção Que Não Envelhece", "artista": "Vigília Attos2", "tom": "Fm",
        "blocos": [{"acordes": ["Fm", "Db9", "Fm/C", "Db9"]}, {"acordes": ["Bbm", "Db9", "Fm", "Cm", "Bbm", "Db9", "Fm", "Eb"]}],
        "letraCifra": SHEET}]})
    assert response.status_code == 200
    result = response.get_json()["resultados"][0]
    assert result["id"] == "cancao-1" and result["changed"] is True
    guides = [block["fraseGuia"] for block in result["blocos"]]
    assert "Primeira linha do verso aqui" in guides and "Linha do refrão número um" in guides
    assert all(not (guide or "").endswith(":") for guide in guides)


def test_song_already_in_standard_is_left_alone(client):
    response = client.post("/api/resumo-harmonico/organizar", headers=auth_headers(client), json={"musicas": [{
        "id": "ok-1", "titulo": "Acende outra vez", "tom": "E",
        "blocos": [{"acordes": ["C#m", "A", "E", "B"], "repeticoes": 4, "fraseGuia": "Ouço um barulho diferente"}],
        "letraCifra": SHEET}]})
    assert response.get_json()["resultados"][0] == {"id": "ok-1", "changed": False, "motivo": "ja_no_padrao"}


def test_song_without_sheet_and_short_lines_is_not_changed(client):
    response = client.post("/api/resumo-harmonico/organizar", headers=auth_headers(client), json={"musicas": [{
        "id": "sem-letra", "titulo": "Só resumo", "tom": "G", "blocos": [{"acordes": ["G", "D", "Em", "C"]}]}]})
    result = response.get_json()["resultados"][0]
    assert result["changed"] is False and result["motivo"] == "sem_letra_cifra"


def test_bad_song_does_not_break_the_others(client):
    response = client.post("/api/resumo-harmonico/organizar", headers=auth_headers(client), json={"musicas": [
        {"id": "estranha", "titulo": "", "blocos": "não é lista"},
        {"id": "cancao-2", "titulo": "Canção", "tom": "Fm", "blocos": [{"acordes": ["Fm", "Db9"]}], "letraCifra": SHEET}]})
    results = {item["id"]: item for item in response.get_json()["resultados"]}
    assert results["cancao-2"]["changed"] is True
    assert results["estranha"]["changed"] is False


def test_requires_login_and_limits_batch(client):
    assert client.post("/api/resumo-harmonico/organizar", json={"musicas": [{"id": "x"}]}).status_code == 401
    too_many = [{"id": str(i), "titulo": "x", "blocos": []} for i in range(61)]
    assert client.post("/api/resumo-harmonico/organizar", headers=auth_headers(client), json={"musicas": too_many}).status_code == 400
