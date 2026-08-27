from __future__ import annotations

from flask import Blueprint, current_app, jsonify

from .. import limiter


blueprint = Blueprint("app_auth", __name__, url_prefix="/api/auth")


@blueprint.get("/config")
@limiter.limit(lambda: current_app.config["AUTH_CONFIG_RATE_LIMIT"])
def auth_config():
    provider = current_app.extensions["supabase_auth"]
    return jsonify({
        "enabled": provider.enabled,
        "provider": "supabase" if provider.enabled else "local",
        "supabaseUrl": current_app.config.get("SUPABASE_URL", "") if provider.enabled else "",
        "supabaseAnonKey": current_app.config.get("SUPABASE_ANON_KEY", "") if provider.enabled else "",
    }), 200
