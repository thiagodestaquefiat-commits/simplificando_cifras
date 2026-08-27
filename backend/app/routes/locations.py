from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import limiter
from ..errors import ApiError
from ..services.location_provider import GeoapifyLocationProvider, LocationProviderError


blueprint = Blueprint("locations", __name__, url_prefix="/api/locations")


def _provider() -> GeoapifyLocationProvider:
    return current_app.extensions["location_provider"]


def _provider_error(error: LocationProviderError):
    raise ApiError("provedor_localizacao_indisponivel", str(error), 503) from error


@blueprint.get("/search")
@limiter.limit(lambda: current_app.config["LOCATION_SEARCH_RATE_LIMIT"])
def search_locations():
    query = " ".join(str(request.args.get("q") or "").split())
    if len(query) < 4:
        raise ApiError("busca_muito_curta", "Digite pelo menos 4 caracteres para buscar um endereço.", 400)
    if len(query) > 200:
        raise ApiError("entrada_invalida", "A busca de endereço excede 200 caracteres.", 400)
    try:
        results = _provider().search(query, limit=5)
    except LocationProviderError as error:
        _provider_error(error)
    return jsonify({"results": results, "provider": "geoapify"}), 200


@blueprint.get("/map")
@limiter.limit(lambda: current_app.config["LOCATION_MAP_RATE_LIMIT"])
def location_map():
    try:
        latitude = float(request.args.get("latitude", ""))
        longitude = float(request.args.get("longitude", ""))
        width = int(request.args.get("width", "720"))
        height = int(request.args.get("height", "320"))
    except (TypeError, ValueError):
        raise ApiError("entrada_invalida", "Informe coordenadas e dimensões válidas.", 400) from None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ApiError("coordenadas_invalidas", "As coordenadas informadas são inválidas.", 400)
    try:
        image = _provider().map_image(latitude, longitude, width, height)
    except LocationProviderError as error:
        _provider_error(error)
    return current_app.response_class(image.body, mimetype=image.content_type, headers={"Cache-Control": "public, max-age=86400"})
