import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app


class TestConfig:
    TESTING = True
    MAX_CONTENT_LENGTH = 64 * 1024
    MAX_TEXT_LENGTH = 50000
    MAX_UPLOAD_SIZE = 10 * 1024 * 1024
    MAX_PDF_PAGES = 20
    CORS_ALLOWED_ORIGINS = ["http://localhost:5500"]
    RESUMO_RATE_LIMIT = "1000 per minute"
    RATELIMIT_STORAGE_URI = "memory://"
    RATELIMIT_HEADERS_ENABLED = True
    OPENAI_API_KEY = "test-key"
    OPENAI_MODEL = "test-model"
    OPENAI_TIMEOUT_SECONDS = 1
    OPENAI_MAX_OUTPUT_TOKENS = 500
    ANTHROPIC_EXPERIMENT_ENABLED = True
    ANTHROPIC_API_KEY = "test-anthropic-key"
    ANTHROPIC_MODEL = "test-claude-model"
    ANTHROPIC_TIMEOUT_SECONDS = 1
    ANTHROPIC_SEARCH_MAX_TOKENS = 1000
    ANTHROPIC_NORMALIZE_MAX_TOKENS = 1000
    ANTHROPIC_WEB_SEARCH_MAX_USES = 3
    ANTHROPIC_AI_RATE_LIMIT = "1000 per minute"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    COLLABORATION_TOKEN_BYTES = 32
    GEOAPIFY_API_KEY = "test-geo-key"
    GEOAPIFY_BROWSER_KEY = ""
    LOCATION_TIMEOUT_SECONDS = 1
    LOCATION_CACHE_TTL_SECONDS = 60
    LOCATION_SEARCH_RATE_LIMIT = "1000 per minute"
    LOCATION_MAP_RATE_LIMIT = "1000 per minute"
    LOCATION_CONFIG_RATE_LIMIT = "1000 per minute"
    SUPABASE_URL = ""
    SUPABASE_ANON_KEY = ""
    SUPABASE_AUTH_TIMEOUT_SECONDS = 1
    AUTH_CONFIG_RATE_LIMIT = "1000 per minute"
    MUSIC_SOURCE_SEARCH_RATE_LIMIT = "1000 per minute"
    MUSIC_SOURCE_MIN_SCORE = 0.62
    MUSIC_SOURCE_MAX_RESULTS = 8


@pytest.fixture()
def app():
    return create_app(TestConfig)


@pytest.fixture()
def client(app):
    return app.test_client()
