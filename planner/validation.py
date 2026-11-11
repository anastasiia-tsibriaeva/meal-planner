"""Проверка входных данных калькулятора.

Ошибки возвращаются понятным текстом, чтобы сразу было видно, что не так с запросом.
"""
from __future__ import annotations


class ValidationError(ValueError):
    pass


MEAL_TYPES = {"breakfast", "lunch", "dinner"}


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_ingredients(ingredients, where: str) -> None:
    _require(isinstance(ingredients, list), f"{where}.ingredients должен быть списком")
    for k, ing in enumerate(ingredients):
        _require(isinstance(ing, dict), f"{where}.ingredients[{k}] должен быть объектом")
        _require(ing.get("name") is None or isinstance(ing["name"], str), f"{where}.ingredients[{k}].name должен быть строкой")


def validate_menu_request(body) -> tuple:
    _require(isinstance(body, dict), "тело запроса должно быть JSON-объектом")
    dishes = body.get("dishes")
    active_days = body.get("activeDays", list(range(7)))

    _require(isinstance(dishes, list), "dishes должен быть списком")
    _require(len(dishes) <= 2000, "слишком много блюд")
    for n, dish in enumerate(dishes):
        where = f"dishes[{n}]"
        _require(isinstance(dish, dict), f"{where} должен быть объектом")
        _require(isinstance(dish.get("id"), (str, int)) and not isinstance(dish.get("id"), bool), f"{where}.id обязателен")
        meal_types = dish.get("meal_types") or []
        _require(isinstance(meal_types, list) and all(m in MEAL_TYPES for m in meal_types),
                 f"{where}.meal_types: допустимы только breakfast, lunch, dinner")
        servings = dish.get("servings_count")
        _require(servings is None or (isinstance(servings, int) and not isinstance(servings, bool) and 0 <= servings <= 100),
                 f"{where}.servings_count должен быть целым числом")
        _check_ingredients(dish.get("ingredients") or [], where)

    _require(isinstance(active_days, list) and all(isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6 for d in active_days),
             "activeDays: список чисел от 0 до 6")
    _require(len(set(active_days)) == len(active_days), "activeDays: дни не должны повторяться")

    from .menu import DEFAULT_HARD_DISHES, HARD_DISHES_OPTIONS
    hard = body.get("hardDishesPerWeek", DEFAULT_HARD_DISHES)
    _require(hard in HARD_DISHES_OPTIONS, "hardDishesPerWeek: допустимо " + ", ".join(HARD_DISHES_OPTIONS))
    hard_min, hard_max = HARD_DISHES_OPTIONS[hard]
    return dishes, sorted(active_days), hard_min, hard_max


def validate_shopping_request(body) -> tuple:
    _require(isinstance(body, dict), "тело запроса должно быть JSON-объектом")
    slots = body.get("cookingSlots")
    pantry = body.get("pantryItems")

    _require(isinstance(slots, list), "cookingSlots должен быть списком")
    _require(len(slots) <= 200, "слишком много слотов")
    for n, slot in enumerate(slots):
        where = f"cookingSlots[{n}]"
        _require(isinstance(slot, dict), f"{where} должен быть объектом")
        dish = slot.get("dish")
        _require(isinstance(dish, dict), f"{where}.dish должен быть объектом")
        _require(slot.get("servingsUsed") is None or _is_number(slot["servingsUsed"]), f"{where}.servingsUsed должен быть числом")
        _require(dish.get("servings_count") is None or _is_number(dish["servings_count"]), f"{where}.dish.servings_count должен быть числом")
        _check_ingredients(dish.get("ingredients") or [], f"{where}.dish")

    _require(pantry is None or (isinstance(pantry, list) and all(isinstance(p, str) for p in pantry)),
             "pantryItems должен быть списком строк")
    return slots, pantry
