from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_web_search_and_deepseek_fit_inside_gunicorn_timeout():
    """Busca web (orçamento) + DeepSeek precisam terminar antes de o gunicorn matar o worker.

    O Railway usa o Dockerfile (railway.json: builder DOCKERFILE); o Procfile é mantido igual.
    """
    from app.services.web_search import WEB_SEARCH_BUDGET_SECONDS

    config_source = (BACKEND_ROOT / "app" / "config.py").read_text(encoding="utf-8")
    procfile = (BACKEND_ROOT / "Procfile").read_text(encoding="utf-8")
    dockerfile = (BACKEND_ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert 'os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90")' in config_source
    assert "--timeout 180" in procfile
    assert '"--timeout", "180"' in dockerfile
    assert WEB_SEARCH_BUDGET_SECONDS + 90 < 180
