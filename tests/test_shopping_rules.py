import unittest

from planner.shopping import build_shopping_items


def slot(ingredients, servings_count=1, servings_used=None):
    return {"dish": {"servings_count": servings_count, "ingredients": ingredients}, "servingsUsed": servings_used}


class ShoppingRules(unittest.TestCase):
    def texts(self, *slots, pantry=None):
        return [i["text"] for i in build_shopping_items(list(slots), pantry)]

    def test_same_ingredient_is_summed_across_dishes(self):
        self.assertEqual(
            self.texts(slot([{"name": "Лук", "quantity": 1, "unit": "шт"}]),
                       slot([{"name": "лук", "quantity": 2, "unit": "шт"}])),
            ["Лук 3 шт"],
        )

    def test_quantity_is_scaled_to_servings_used(self):
        # рецепт на 2 приёма пищи, готовим на 3 → ×1.5
        self.assertEqual(self.texts(slot([{"name": "Рис", "quantity": 200, "unit": "г"}], 2, 3)), ["Рис 300 г"])

    def test_pieces_round_up(self):
        self.assertEqual(self.texts(slot([{"name": "Яйца", "quantity": 1, "unit": "шт"}], 2, 3)), ["Яйца 2 шт"])

    def test_different_units_are_listed_separately(self):
        self.assertEqual(
            self.texts(slot([{"name": "Молоко", "quantity": 200, "unit": "мл"}]),
                       slot([{"name": "Молоко", "quantity": 1, "unit": "л"}])),
            ["Молоко 200 мл + 1 л"],
        )

    def test_pantry_items_are_skipped_by_whole_words(self):
        texts = self.texts(slot([{"name": "Соль морская"}, {"name": "Фасоль", "quantity": 200, "unit": "г"},
                                 {"name": "Перец чёрный молотый"}]))
        self.assertEqual(texts, ["Фасоль 200 г"])

    def test_yo_and_e_are_the_same_ingredient(self):
        self.assertEqual(
            self.texts(slot([{"name": "Ёлочные грибы", "quantity": 100, "unit": "г"}]),
                       slot([{"name": "елочные  грибы", "quantity": 50, "unit": "г"}])),
            ["Ёлочные грибы 150 г"],
        )

    def test_js_style_rounding(self):
        # в Python round(2.5) == 2, а в JS Math.round(2.5) == 3 — должны вести себя как JS
        self.assertEqual(self.texts(slot([{"name": "Сахар", "quantity": 2.5, "unit": "г"}])), ["Сахар 3 г"])


if __name__ == "__main__":
    unittest.main()
