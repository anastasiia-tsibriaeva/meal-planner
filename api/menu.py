"""POST /api/menu — сгенерировать меню на неделю.

Запрос:  {"dishes": [...], "activeDays": [0, 1, 2, 3, 4, 5, 6], "hardDishesPerWeek": "1-2" | "3-5" | "any"}
Ответ:   {"days": [{"dayIndex": 0, "breakfast": {"dishId", "isLeftover", "servingsUsed"} | null,
                    "lunch": ..., "dinner": ...}, ...]}
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from planner.web import JsonHandler  # noqa: E402
from planner.menu import generate_menu, menu_to_plan  # noqa: E402
from planner.validation import validate_menu_request  # noqa: E402


class handler(JsonHandler):
    def handle_json(self, body):
        dishes, active_days, hard_min, hard_max = validate_menu_request(body)
        menu = generate_menu(dishes, active_days, hard_min=hard_min, hard_max=hard_max)
        return {"days": menu_to_plan(menu)}
