"""Настройка «Сложных блюд в неделю»: диапазон «от и до»."""
import random
import unittest

from planner.menu import HARD_DISHES_OPTIONS, IS_WEEKEND, MEAL_TYPES, generate_menu

MEAT = ["poultry", "red_meat", "fish", "seafood", "none"]


def make_dishes(hard_count=8):
    dishes = [{"id": f"b{i}", "meal_types": ["breakfast"], "servings_count": 1, "meat_type": "none"} for i in range(3)]
    for i in range(16):
        dishes.append({
            "id": f"d{i}",
            "meal_types": ["lunch", "dinner"] if i % 2 else ["dinner"],
            "meat_type": MEAT[i % 5],
            "difficulty": "hard" if i < hard_count else "easy",
            "servings_count": [1, 2, 3][i % 3],
            "weekends_only": i == 5,
            "ingredients": [{"name": f"п{i % 4}"}],
        })
    return dishes


def hard_cooking_count(menu):
    return sum(
        1 for day in menu for mt in ("lunch", "dinner")
        if day[mt] and not day[mt]["isLeftover"] and day[mt]["dish"].get("difficulty") == "hard"
    )


class HardDishes(unittest.TestCase):
    def run_weeks(self, option, dishes, runs=800):
        hard_min, hard_max = HARD_DISHES_OPTIONS[option]
        rng = random.Random(3).random
        for run in range(runs):
            active = list(range(7)) if run % 2 else [0, 1, 2, 4, 5, 6]
            yield active, generate_menu(dishes, active, rng, hard_min=hard_min, hard_max=hard_max)

    def test_one_to_two(self):
        for _, menu in self.run_weeks("1-2", make_dishes()):
            self.assertIn(hard_cooking_count(menu), (1, 2))

    def test_three_to_five(self):
        for _, menu in self.run_weeks("3-5", make_dishes(hard_count=12)):
            self.assertGreaterEqual(hard_cooking_count(menu), 3)
            self.assertLessEqual(hard_cooking_count(menu), 5)

    def test_any_has_no_upper_limit(self):
        counts = [hard_cooking_count(m) for _, m in self.run_weeks("any", make_dishes(hard_count=12), runs=300)]
        self.assertGreater(max(counts), 5)

    def test_minimum_is_soft_without_hard_dishes(self):
        """Нет сложных блюд — меню всё равно составляется, просто без них."""
        for _, menu in self.run_weeks("3-5", make_dishes(hard_count=0), runs=100):
            self.assertEqual(hard_cooking_count(menu), 0)
            self.assertTrue(all(menu[d]["lunch"] for d in range(7) if menu[d]["isActive"]))

    def test_rules_still_hold_after_adding_hard_dishes(self):
        """Остатки идут за готовкой, длина блока = порциям, «только выходные» — в выходные."""
        for active, menu in self.run_weeks("3-5", make_dishes(hard_count=12)):
            for meal_type in MEAL_TYPES:
                prev, block = None, None
                for day in active:
                    slot = menu[day][meal_type]
                    if slot is None:
                        prev = None
                        continue
                    if slot["isLeftover"]:
                        self.assertEqual(prev["dish"]["id"], slot["dish"]["id"])
                        block["n"] += 1
                    else:
                        if block and meal_type != "breakfast":
                            self.assertEqual(block["n"], block["slot"]["servingsUsed"])
                        block = {"slot": slot, "n": 1}
                        if slot["dish"].get("weekends_only"):
                            self.assertTrue(IS_WEEKEND[day])
                    prev = slot
                if block and meal_type != "breakfast":
                    self.assertEqual(block["n"], block["slot"]["servingsUsed"])


if __name__ == "__main__":
    unittest.main()
