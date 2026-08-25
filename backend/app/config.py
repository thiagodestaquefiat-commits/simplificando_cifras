from __future__ import annotations

import os

from dotenv import load_dotenv


load_dotenv()


def _csv(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


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
