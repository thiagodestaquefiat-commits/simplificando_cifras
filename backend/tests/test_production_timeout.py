from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_multimodal_timeouts_allow_openai_to_finish_before_gunicorn():
    config_source = (BACKEND_ROOT / "app" / "config.py").read_text(encoding="utf-8")
    procfile = (BACKEND_ROOT / "Procfile").read_text(encoding="utf-8")
    railway = (BACKEND_ROOT / "railway.json").read_text(encoding="utf-8")

    assert 'os.getenv("OPENAI_TIMEOUT_SECONDS", "90")' in config_source
    assert "--timeout 120" in procfile
    assert "--timeout 120" in railway
