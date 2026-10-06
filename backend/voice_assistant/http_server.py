"""Helper da prévia: somente loopback, sem Flask/.env/conexão com banco real."""

from collections import deque
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from time import monotonic

from .api import resolve_snapshot


class Handler(BaseHTTPRequestHandler):
    requests = deque()

    def log_message(self, *_args):
        pass  # Não registra comandos ou datas.

    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/assistant/resolve":
            return self.reply(404, {"error": "not_found"})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.reply(415, {"error": "content_type"})
        now = monotonic()
        while self.requests and self.requests[0] < now - 60:
            self.requests.popleft()
        if len(self.requests) >= 30:
            return self.reply(429, {"error": "rate_limit"})
        self.requests.append(now)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32000:
                return self.reply(413, {"error": "size_limit"})
            data = json.loads(self.rfile.read(length))
            result = resolve_snapshot(data)
        except (ValueError, TypeError):
            return self.reply(400, {"error": "invalid_input"})
        except Exception:
            return self.reply(500, {"error": "unavailable"})
        return self.reply(200, result)


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 5010), Handler)
    print("Motor de intenções Python local disponível.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
