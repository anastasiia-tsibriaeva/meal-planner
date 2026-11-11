"""Локальный запуск калькулятора для разработки: python3 dev_api.py

Поднимает /api/menu и /api/shopping на http://localhost:8000.
Vite (npm run dev) сам перенаправляет туда запросы /api — см. vite.config.js.
На Vercel этот файл не используется.
"""
import importlib.util
import os
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


def load_handler(name):
    spec = importlib.util.spec_from_file_location(f"api_{name}", os.path.join(ROOT, "api", f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


ROUTES = {"/api/menu": load_handler("menu"), "/api/shopping": load_handler("shopping")}


class Router(ROUTES["/api/menu"]):
    def do_POST(self):
        route = ROUTES.get(self.path.split("?")[0])
        if route is None:
            return self._send(404, {"error": "нет такого адреса"})
        self.handle_json = route.handle_json.__get__(self)
        return super().do_POST()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Калькулятор запущен: http://localhost:{port}/api/menu и /api/shopping")
    ThreadingHTTPServer(("127.0.0.1", port), Router).serve_forever()
