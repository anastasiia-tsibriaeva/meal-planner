"""Общая HTTP-обёртка для функций на Vercel: принимает JSON через POST и отдаёт JSON."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler

from .validation import ValidationError

MAX_BODY_BYTES = 1_000_000


class JsonHandler(BaseHTTPRequestHandler):
    """Наследники реализуют handle_json(body) -> dict."""

    def handle_json(self, body):  # pragma: no cover — переопределяется
        raise NotImplementedError

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send(400, {"error": "пустой или слишком большой запрос"})

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._send(400, {"error": "тело запроса — не JSON"})

        try:
            result = self.handle_json(body)
        except ValidationError as err:
            return self._send(400, {"error": str(err)})
        except Exception:  # неожиданная ошибка — без подробностей наружу
            return self._send(500, {"error": "внутренняя ошибка калькулятора"})
        return self._send(200, result)

    def do_GET(self):
        self._send(405, {"error": "используй POST"})

    def _send(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):  # не засоряем логи каждым запросом
        pass
