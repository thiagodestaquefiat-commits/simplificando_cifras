from __future__ import annotations

import os

from dotenv import load_dotenv


load_dotenv()


def _csv(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def _database_uri(value: str) -> str:
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


class Config:
    JSON_SORT_KEYS = False
    MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(10 * 1024 * 1024)))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(MAX_UPLOAD_SIZE + 64 * 1024)))
    MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "20"))

    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    OPENAI_TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "30"))
    OPENAI_MAX_OUTPUT_TOKENS = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "12000"))

    CORS_ALLOWED_ORIGINS = _csv(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5500,http://localhost:5500,https://deploy-preview-8--simplificandocifras.netlify.app,https://simplificandocifras.netlify.app",
    )
    RESUMO_RATE_LIMIT = os.getenv("RESUMO_RATE_LIMIT", "10 per minute")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "50000"))

    _database_url = os.getenv("DATABASE_URL") or "sqlite:///simplificando_cifras.db"
    SQLALCHEMY_DATABASE_URI = _database_uri(_database_url)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    COLLABORATION_TOKEN_BYTES = int(os.getenv("COLLABORATION_TOKEN_BYTES", "32"))

    GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "")
    LOCATION_PROVIDER = os.getenv("LOCATION_PROVIDER", "geoapify")
    LOCATION_TIMEOUT_SECONDS = float(os.getenv("LOCATION_TIMEOUT_SECONDS", "6"))
    LOCATION_CACHE_TTL_SECONDS = int(os.getenv("LOCATION_CACHE_TTL_SECONDS", "600"))
    LOCATION_SEARCH_RATE_LIMIT = os.getenv("LOCATION_SEARCH_RATE_LIMIT", "30 per minute")
    LOCATION_MAP_RATE_LIMIT = os.getenv("LOCATION_MAP_RATE_LIMIT", "60 per minute")

    SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_AUTH_TIMEOUT_SECONDS = float(os.getenv("SUPABASE_AUTH_TIMEOUT_SECONDS", "6"))
    AUTH_CONFIG_RATE_LIMIT = os.getenv("AUTH_CONFIG_RATE_LIMIT", "60 per minute")
