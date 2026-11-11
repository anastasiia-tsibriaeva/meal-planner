"""Проверяем HTTP-обёртку: настоящий локальный сервер и настоящие POST-запросы."""
import importlib.util
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_handler(name):
    spec = importlib.util.spec_from_file_location(f"api_{name}", os.path.join(ROOT, "api", f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.handler


class ApiTest(unittest.TestCase):
    servers = []

    @classmethod
    def start(cls, name):
        server = ThreadingHTTPServer(("127.0.0.1", 0), load_handler(name))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.servers.append(server)
        return f"http://127.0.0.1:{server.server_address[1]}"

    @classmethod
    def setUpClass(cls):
        cls.menu_url = cls.start("menu")
        cls.shopping_url = cls.start("shopping")

    @classmethod
    def tearDownClass(cls):
        for server in cls.servers:
            server.shutdown()

    def post(self, url, payload):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read())

    def test_menu_ok(self):
        dishes = [
            {"id": "b1", "meal_types": ["breakfast"], "servings_count": 1},
            {"id": "m1", "meal_types": ["lunch", "dinner"], "servings_count": 2, "meat_type": "fish"},
        ]
        status, body = self.post(self.menu_url, {"dishes": dishes, "activeDays": [0, 1, 2]})
        self.assertEqual(status, 200)
        self.assertEqual(len(body["days"]), 7)
        self.assertEqual(body["days"][0]["breakfast"]["dishId"], "b1")
        self.assertIsNone(body["days"][3]["lunch"])

    def test_menu_bad_input(self):
        status, body = self.post(self.menu_url, {"dishes": [{"id": "x", "meal_types": ["brunch"]}]})
        self.assertEqual(status, 400)
        self.assertIn("meal_types", body["error"])

    def test_menu_bad_hard_dishes_option(self):
        status, body = self.post(self.menu_url, {"dishes": [], "hardDishesPerWeek": "10"})
        self.assertEqual(status, 400)
        self.assertIn("hardDishesPerWeek", body["error"])

    def test_not_json(self):
        status, body = self.post(self.menu_url, b"hello")
        self.assertEqual(status, 400)

    def test_shopping_ok(self):
        payload = {"cookingSlots": [{"dish": {"servings_count": 1, "ingredients": [{"name": "Лук", "quantity": 2, "unit": "шт"}]},
                                     "servingsUsed": 1}], "pantryItems": ["соль"]}
        status, body = self.post(self.shopping_url, payload)
        self.assertEqual(status, 200)
        self.assertEqual(body["items"][0]["text"], "Лук 2 шт")


if __name__ == "__main__":
    unittest.main()
