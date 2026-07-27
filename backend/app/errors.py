from __future__ import annotations

from flask import g, jsonify
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _payload(code: str, message: str, details=None):
    body = {
        "erro": {
            "codigo": code,
            "mensagem": message,
            "requestId": g.get("request_id", ""),
        }
    }
    if details:
        body["erro"]["detalhes"] = details
    return body


def register_error_handlers(app) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        return jsonify(_payload(error.code, error.message)), error.status_code

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        details = [
            {
                "campo": ".".join(str(part) for part in item["loc"]),
                "mensagem": item["msg"],
            }
            for item in error.errors()
        ]
        return jsonify(_payload("entrada_invalida", "Revise os dados enviados.", details)), 400

    @app.errorhandler(413)
    def handle_too_large(_error):
        return jsonify(_payload("requisicao_muito_grande", "A requisição excede o limite permitido.")), 413

    @app.errorhandler(429)
    def handle_rate_limit(_error):
        return jsonify(_payload("limite_excedido", "Muitas solicitações. Tente novamente em instantes.")), 429

    @app.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        return jsonify(_payload("erro_http", error.description)), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(_error: Exception):
        app.logger.exception("Erro interno requestId=%s", g.get("request_id", ""))
        return jsonify(_payload("erro_interno", "Não foi possível concluir a solicitação.")), 500
