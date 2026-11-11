"""POST /api/shopping — собрать список покупок по дням готовки.

Запрос:  {"cookingSlots": [{"dish": {"servings_count", "ingredients": [...]}, "servingsUsed": 3}],
          "pantryItems": ["соль", ...]}
Ответ:   {"items": [{"key": "лук", "name": "Лук", "text": "Лук 3 шт"}, ...]}
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from planner.web import JsonHandler  # noqa: E402
from planner.shopping import build_shopping_items  # noqa: E402
from planner.validation import validate_shopping_request  # noqa: E402


class handler(JsonHandler):
    def handle_json(self, body):
        slots, pantry = validate_shopping_request(body)
        return {"items": build_shopping_items(slots, pantry)}
