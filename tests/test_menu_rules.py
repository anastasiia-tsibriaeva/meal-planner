"""Проверяем правила генератора на большом числе случайных недель."""
import random
import unittest

from planner.menu import IS_WEEKEND, MEAL_TYPES, generate_menu

ING = ["лук", "морковь", "курица", "рис", "сливки", "томаты", "фасоль", "чеснок"]
MEAT = ["poultry", "red_meat", "fish", "seafood", "none"]


def make_dishes():
    dishes = []
    for i in range(1, 20):
        meal_types = ["breakfast"] if i <= 5 else (["lunch", "dinner"] if i % 2 else ["dinner"])
        dishes.append({
            "id": f"d{i}",
            "meal_types": meal_types,
            "meat_type": MEAT[i % 5],
            "difficulty": "hard" if i % 7 == 0 else "easy",
            "servings_count": 1 if i <= 5 else [1, 2, 3][i % 3],
            "weekends_only": i % 9 == 0,
            "ingredients": [{"name": ING[i % 8]}, {"name": ING[(i * 3) % 8]}],
        })
    return dishes


class MenuRules(unittest.TestCase):
    def setUp(self):
        self.rng = random.Random(1).random
        self.dishes = make_dishes()

    def weeks(self, runs=1500):
        for run in range(runs):
            active = list(range(7)) if run % 2 else [0, 1, 3, 4, 5, 6]
            yield active, generate_menu(self.dishes, active, self.rng)

    def test_leftovers_follow_their_cooking_day(self):
        """«Остатки» всегда идут сразу за днём готовки того же блюда."""
        for active, menu in self.weeks():
            for meal_type in MEAL_TYPES:
                prev = None
                for day in active:
                    slot = menu[day][meal_type]
                    if slot and slot["isLeftover"]:
                        self.assertIsNotNone(prev)
                        self.assertEqual(prev["dish"]["id"], slot["dish"]["id"])
                    prev = slot

    def test_block_length_equals_servings_used(self):
        """Готовка на 3 приёма пищи = день готовки + ровно 2 дня остатков."""
        for active, menu in self.weeks():
            for meal_type in ("lunch", "dinner"):
                block = None
                for day in active:
                    slot = menu[day][meal_type]
                    if slot is None:
                        continue
                    if not slot["isLeftover"]:
                        if block:
                            self.assertEqual(block["count"], block["slot"]["servingsUsed"])
                        block = {"slot": slot, "count": 1}
                    else:
                        block["count"] += 1
                if block:
                    self.assertEqual(block["count"], block["slot"]["servingsUsed"])

    def test_all_active_days_filled_and_inactive_empty(self):
        for active, menu in self.weeks(300):
            for day in range(7):
                for meal_type in MEAL_TYPES:
                    if day in active:
                        self.assertIsNotNone(menu[day][meal_type])
                    else:
                        self.assertIsNone(menu[day][meal_type])

    def test_weekend_only_dishes_cooked_on_weekends(self):
        for _, menu in self.weeks(500):
            for day in range(7):
                for meal_type in MEAL_TYPES:
                    slot = menu[day][meal_type]
                    if slot and not slot["isLeftover"] and slot["dish"]["weekends_only"]:
                        self.assertTrue(IS_WEEKEND[day])

    def test_at_most_one_hard_dish(self):
        for _, menu in self.weeks(500):
            hard = sum(
                1 for day in menu for mt in MEAL_TYPES
                if day[mt] and not day[mt]["isLeftover"] and day[mt]["dish"]["difficulty"] == "hard"
            )
            self.assertLessEqual(hard, 1)

    def test_empty_inputs(self):
        menu = generate_menu([], list(range(7)))
        self.assertEqual(len(menu), 7)
        self.assertTrue(all(day[mt] is None for day in menu for mt in MEAL_TYPES))


if __name__ == "__main__":
    unittest.main()
