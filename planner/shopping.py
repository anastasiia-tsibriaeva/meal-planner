"""Список покупок по меню.

- Учитываем только дни готовки (остатки уже куплены вместе с готовкой).
- Масштабируем количество под реальное число порций: servingsUsed / servings_count.
- Суммируем одинаковые ингредиенты из разных блюд (отдельно по каждой единице).
- Штуки округляем вверх, граммы и миллилитры — до целых.
- Убираем базовые продукты (соль, перец и т.п.).
"""
from __future__ import annotations

import math
import re
from typing import Optional

from .jscompat import js_parse_float, js_round

DEFAULT_PANTRY_ITEMS = ["соль", "чёрный перец", "перец чёрный", "перец молотый"]

PIECE_UNITS = {"шт", "штук", "штука", "штуки", "шт.", "pcs", "piece", "pieces"}
INTEGER_UNITS = {"г", "гр", "гр.", "мл", "g", "ml"}

_WORD_SEPARATORS = re.compile(r"[\s,()\-]+")
_SPACES = re.compile(r"\s+")


def normalize_name(name) -> str:
    """«  Чёрный   перец » → «черный перец»."""
    return _SPACES.sub(" ", (name or "").lower().strip().replace("ё", "е"))


def _is_pantry_item(ingredient_name: str, pantry_items: list) -> bool:
    """Базовый продукт, если все слова записи из кладовой есть в названии как отдельные слова.

    «соль морская» → базовый, «фасоль» → нет.
    """
    words = [w for w in _WORD_SEPARATORS.split(normalize_name(ingredient_name)) if w]
    for item in pantry_items:
        item_words = [w for w in normalize_name(item).split(" ") if w]
        if item_words and all(w in words for w in item_words):
            return True
    return False


def _round_quantity(qty: float, unit: str) -> float:
    u = unit.lower().strip()
    if u in PIECE_UNITS:
        return math.ceil(qty - 1e-9)
    if u in INTEGER_UNITS:
        return js_round(qty)
    return js_round(qty * 100) / 100


def _number_to_str(x: float) -> str:
    """Как String(x) в JS: целое без «.0» (в Python str(1.0) == "1.0")."""
    return str(int(x)) if float(x).is_integer() else str(x)


def _format_number(qty: float) -> str:
    if float(qty).is_integer():
        return _number_to_str(qty)
    fractions = {0.5: "½", 0.25: "¼", 0.75: "¾"}
    if qty in fractions:
        return fractions[qty]
    return _number_to_str(js_round(qty * 10) / 10)


def _format_quantity(qty: float, unit: str) -> str:
    number = _format_number(qty)
    return f"{number} {unit}" if unit else number


def _sort_key(name: str):
    """Алфавитный порядок для русских слов: без учёта регистра, «ё» рядом с «е»."""
    return (name.lower().replace("ё", "е"), name.lower(), name)


def build_shopping_items(cooking_slots: list, pantry_items: Optional[list] = None) -> list:
    """Собирает список покупок.

    :param cooking_slots: [{"dish": {"servings_count", "ingredients": [{"name", "quantity", "unit"}]},
        "servingsUsed": int}] — только дни готовки
    :param pantry_items: базовые продукты, которые не надо покупать
    :return: [{"key", "name", "text"}] по алфавиту, например {"text": "Лук 3 шт"}
    """
    if pantry_items is None:
        pantry_items = DEFAULT_PANTRY_ITEMS

    # key → {"name": ..., "by_unit": {unit_key: {"unit": ..., "qty": ...}}}
    entries: dict = {}

    for slot in cooking_slots:
        dish = slot.get("dish") or {}
        ingredients = dish.get("ingredients") or []
        if not ingredients:
            continue
        total = dish.get("servings_count") or 1
        used = slot.get("servingsUsed") or total
        scale = used / total

        for ing in ingredients:
            name = (ing.get("name") or "").strip()
            if not name or _is_pantry_item(name, pantry_items):
                continue

            key = normalize_name(name)
            entry = entries.setdefault(key, {"name": name, "by_unit": {}})

            qty = js_parse_float(ing.get("quantity"))
            if not math.isnan(qty) and qty > 0:
                unit = (ing.get("unit") or "").strip()
                unit_key = unit.lower()
                prev = entry["by_unit"].get(unit_key)
                entry["by_unit"][unit_key] = {
                    "unit": prev["unit"] if prev else unit,
                    "qty": (prev["qty"] if prev else 0) + qty * scale,
                }

    result = []
    for key, entry in entries.items():
        parts = [
            _format_quantity(_round_quantity(v["qty"], v["unit"]), v["unit"])
            for v in entry["by_unit"].values()
        ]
        text = f"{entry['name']} {' + '.join(parts)}" if parts else entry["name"]
        result.append({"key": key, "name": entry["name"], "text": text})

    result.sort(key=lambda item: _sort_key(item["name"]))
    return result
