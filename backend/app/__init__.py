from __future__ import annotations

import uuid

from flask import Flask, g, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .config import Config
from .errors import register_error_handlers


limiter = Limiter(key_func=get_remote_address, default_limits=[])


def create_app(config_object: type[Config] | Config = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    limiter.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ALLOWED_ORIGINS"]}},
        methods=["POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-ID"],
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
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    from .routes.resumo_harmonico import blueprint

    app.register_blueprint(blueprint)
    register_error_handlers(app)
    return app
