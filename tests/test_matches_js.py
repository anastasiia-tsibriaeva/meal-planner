"""Python-версия должна давать ровно те же результаты, что и прежняя JS-версия.

Эталоны в tests/fixtures сняты с JS-кода (src/lib/menuGenerator.js и shoppingList.js)
на одинаковой последовательности «случайных» чисел.
"""
import json
import os
import unittest

from planner.menu import generate_menu, menu_to_plan
from planner.shopping import build_shopping_items

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def load(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return json.load(f)


def sequence_rng(numbers, start):
    """Выдаёт числа из списка по очереди — как подменённый Math.random в JS."""
    state = {"i": start}

    def rng():
        value = numbers[state["i"] % len(numbers)]
        state["i"] += 1
        return value

    return rng


class MenuMatchesJs(unittest.TestCase):
    def test_all_cases(self):
        data = load("js_reference_menu.json")
        for n, case in enumerate(data["cases"]):
            with self.subTest(case=n):
                rng = sequence_rng(data["random"], case["offset"])
                menu = generate_menu(case["input"]["dishes"], case["input"]["activeDays"], rng)
                self.assertEqual(menu_to_plan(menu), case["expected"])


class ShoppingMatchesJs(unittest.TestCase):
    def test_all_cases(self):
        data = load("js_reference_shopping.json")
        for n, case in enumerate(data["cases"]):
            with self.subTest(case=n):
                result = build_shopping_items(case["input"]["cookingSlots"], case["input"]["pantryItems"])
                self.assertEqual(result, case["expected"])


if __name__ == "__main__":
    unittest.main()
