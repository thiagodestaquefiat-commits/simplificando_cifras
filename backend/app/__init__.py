from __future__ import annotations

import uuid
import re

from flask import Flask, g, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .config import Config
from .database import db, ensure_additive_collaboration_columns
from .errors import register_error_handlers


limiter = Limiter(key_func=get_remote_address, default_limits=[])


def create_app(config_object: type[Config] | Config = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)

    limiter.init_app(app)
    from .services.location_provider import GeoapifyLocationProvider
    from .services.supabase_auth import SupabaseAuthProvider
    from .services.music_sources import AuthorizedMusicSourceRegistry
    from .services.youtube_provider import YouTubeProvider
    app.extensions["location_provider"] = GeoapifyLocationProvider(
        api_key=app.config.get("GEOAPIFY_API_KEY", ""),
        timeout_seconds=app.config.get("LOCATION_TIMEOUT_SECONDS", 6),
        cache_ttl_seconds=app.config.get("LOCATION_CACHE_TTL_SECONDS", 600),
    )
    app.extensions["supabase_auth"] = SupabaseAuthProvider(
        url=app.config.get("SUPABASE_URL", ""),
        anon_key=app.config.get("SUPABASE_ANON_KEY", ""),
        timeout_seconds=app.config.get("SUPABASE_AUTH_TIMEOUT_SECONDS", 6),
    )
    app.extensions["youtube_provider"] = YouTubeProvider(
        api_key=app.config.get("YOUTUBE_API_KEY", ""),
        timeout_seconds=app.config.get("YOUTUBE_TIMEOUT_SECONDS", 8),
        cache_ttl_seconds=app.config.get("YOUTUBE_CACHE_TTL_SECONDS", 86_400),
    )
    # Providers externos só entram aqui após contrato/API e allowlist aprovados.
    app.extensions["music_source_registry"] = AuthorizedMusicSourceRegistry(
        [],
        min_score=app.config.get("MUSIC_SOURCE_MIN_SCORE", 0.62),
        max_results=app.config.get("MUSIC_SOURCE_MAX_RESULTS", 8),
        max_content_chars=app.config.get("MAX_TEXT_LENGTH", 50_000),
    )
    CORS(
        app,
        resources={r"/api/*": {"origins": [*app.config["CORS_ALLOWED_ORIGINS"], re.compile(r"https://deploy-preview-\d+--simplificandocifras\.netlify\.app")]}},
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        supports_credentials=False,
        max_age=600,
    )

    @app.before_request
    def assign_request_id() -> None:
        g.request_id = str(uuid.uuid4())

    @app.after_request
    def include_request_id(response):
        response.headers["X-Request-ID"] = g.get("request_id", "")
        response.headers["X-Content-Type-Options"] = "nosniff"
        if "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    from .routes.events import blueprint as events_blueprint
    from .routes.locations import blueprint as locations_blueprint
    from .routes.auth import blueprint as auth_blueprint
    from .routes.bands import blueprint as bands_blueprint
    from .routes.music_sources import blueprint as music_sources_blueprint
    from .routes.youtube import blueprint as youtube_blueprint
    from .routes.resumo_harmonico import blueprint

    app.register_blueprint(blueprint)
    app.register_blueprint(events_blueprint)
    app.register_blueprint(locations_blueprint)
    app.register_blueprint(auth_blueprint)
    app.register_blueprint(bands_blueprint)
    app.register_blueprint(music_sources_blueprint)
    app.register_blueprint(youtube_blueprint)
    with app.app_context():
        # Cria tabelas ausentes e aplica somente extensões aditivas conhecidas.
        db.create_all()
        ensure_additive_collaboration_columns()
    register_error_handlers(app)
    return app
