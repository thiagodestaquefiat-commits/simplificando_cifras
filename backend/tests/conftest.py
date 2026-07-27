import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app


class TestConfig:
    TESTING = True
    MAX_CONTENT_LENGTH = 64 * 1024
    MAX_TEXT_LENGTH = 50000
    CORS_ALLOWED_ORIGINS = ["http://localhost:5500"]
    RESUMO_RATE_LIMIT = "1000 per minute"
    RATELIMIT_STORAGE_URI = "memory://"
    RATELIMIT_HEADERS_ENABLED = True
    OPENAI_API_KEY = "test-key"
    OPENAI_MODEL = "test-model"
    OPENAI_TIMEOUT_SECONDS = 1
    OPENAI_MAX_OUTPUT_TOKENS = 500


@pytest.fixture()
def app():
    return create_app(TestConfig)


@pytest.fixture()
def client(app):
    return app.test_client()
