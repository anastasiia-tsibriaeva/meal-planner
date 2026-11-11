"""Генератор меню на неделю.

Правила:
- Завтраки: одно блюдо на 2 активных дня подряд.
- Обеды и ужины: подбираем блюда так, чтобы сумма порций = числу активных дней
  (без остатков в конце недели).
- Блюда на 2 или 3 приёма пищи можно растягивать/сжимать между 2 и 3.
- weekends_only: блюдо готовится (как новое) только в субботу или воскресенье.
- Не больше одного сложного блюда за неделю.
- Разнообразие мяса: стараемся охватить все 4 типа.
- Кластеризация: блюда с общими ингредиентами переносим в один 3-дневный период.

Дни недели — индексы 0..6, где 0 — понедельник.
"""
from __future__ import annotations

import math
import random
from typing import Callable, Optional

MEAL_TYPES = ("breakfast", "lunch", "dinner")
IS_WEEKEND = (False, False, False, False, False, True, True)
MEAT_TYPES_TRACKABLE = ("poultry", "red_meat", "fish", "seafood")
MAX_PICK_ATTEMPTS = 40

Rng = Callable[[], float]  # функция, возвращающая случайное число в [0, 1)


def _servings(dish: dict) -> int:
    s = dish.get("servings_count")
    return 1 if s is None else s


def _shuffle(items: list, rng: Rng) -> list:
    """Перемешивание Фишера — Йетса."""
    result = list(items)
    for i in range(len(result) - 1, 0, -1):
        j = math.floor(rng() * (i + 1))
        result[i], result[j] = result[j], result[i]
    return result


def _pick_dish(
    candidates: list,
    rng: Rng,
    *,
    is_weekend: bool,
    meat_types_used: set,
    used_dish_ids: set,
    hard_count_week: int,
    slots_remaining: int,
) -> Optional[dict]:
    """Выбирает блюдо с учётом ограничений.

    Каждый фильтр применяется, только если после него остаётся хотя бы одно блюдо —
    то есть ограничения «мягкие»: лучше нарушить правило, чем оставить слот пустым.
    """
    if not candidates:
        return None

    pool = list(candidates)

    def narrow(condition) -> None:
        nonlocal pool
        filtered = [d for d in pool if condition(d)]
        if filtered:
            pool = filtered

    if not is_weekend:
        narrow(lambda d: not d.get("weekends_only"))

    if hard_count_week >= 1:
        narrow(lambda d: d.get("difficulty") != "hard")

    missing_types = [t for t in MEAT_TYPES_TRACKABLE if t not in meat_types_used]
    if missing_types:
        narrow(lambda d: d.get("meat_type") in missing_types)

    narrow(lambda d: d["id"] not in used_dish_ids)

    if slots_remaining > 0:
        def fits(d: dict) -> bool:
            s = _servings(d)
            return s <= slots_remaining or (s == 3 and slots_remaining >= 2)
        narrow(fits)

    return pool[math.floor(rng() * len(pool))]


def _effective_servings(dish: dict, remaining: int) -> int:
    """Сколько приёмов пищи займёт блюдо с учётом гибкости 2↔3."""
    s = _servings(dish)

    if s not in (2, 3):
        return min(s, remaining)

    if remaining <= 1:
        return 1
    if remaining in (2, 3):
        return remaining

    # Выбираем 2 или 3 так, чтобы остаток проще было закрыть следующими блюдами
    rem2 = remaining - 2
    rem3 = remaining - 3
    score2 = 0 if rem2 % 3 == 0 else (1 if rem2 % 2 == 0 else 2)
    score3 = (0 if rem3 % 2 == 0 else (1 if rem3 % 3 == 0 else 2)) if rem3 >= 0 else 99
    return 3 if score3 <= score2 else 2


def _plan_meal_slots(dishes: list, active_days: list, rng: Rng, state: dict) -> list:
    """Подбирает последовательность блюд для одного приёма пищи (обеда или ужина).

    Возвращает список (блюдо, число порций). Обновляет state: использованные блюда,
    типы мяса и счётчик сложных блюд.
    """
    if not dishes:
        return []

    target = len(active_days)
    plan = []
    filled = 0
    attempts = 0

    while filled < target and attempts < MAX_PICK_ATTEMPTS:
        attempts += 1
        remaining = target - filled
        start_day = active_days[filled] if filled < len(active_days) else active_days[-1]

        dish = _pick_dish(
            dishes,
            rng,
            is_weekend=IS_WEEKEND[start_day],
            meat_types_used=state["meat_types_used"],
            used_dish_ids=state["used_dish_ids"],
            hard_count_week=state["hard_count_week"],
            slots_remaining=remaining,
        )
        if dish is None:
            break

        servings = _effective_servings(dish, remaining)
        plan.append((dish, servings))
        state["used_dish_ids"].add(dish["id"])
        if dish.get("meat_type") in MEAT_TYPES_TRACKABLE:
            state["meat_types_used"].add(dish["meat_type"])
        if dish.get("difficulty") == "hard":
            state["hard_count_week"] += 1
        filled += servings

    return plan


def _expand_plan(plan: list) -> list:
    """(блюдо, 3) → [готовка, остатки, остатки]."""
    slots = []
    for dish, servings in plan:
        slots.append({"dish": dish, "isLeftover": False, "servingsUsed": servings})
        for _ in range(servings - 1):
            slots.append({"dish": dish, "isLeftover": True, "servingsUsed": servings})
    return slots


def _copy_state(state: dict) -> dict:
    return {
        "meat_types_used": set(state["meat_types_used"]),
        "used_dish_ids": set(state["used_dish_ids"]),
        "hard_count_week": state["hard_count_week"],
    }


def generate_menu(dishes: list, active_days: Optional[list] = None, rng: Rng = random.random) -> list:
    """Составляет меню на неделю.

    :param dishes: блюда — словари с полями id, meal_types, meat_type, difficulty,
        servings_count, weekends_only, ingredients (нужны только названия)
    :param active_days: дни, которые нужно заполнять (0 — понедельник)
    :param rng: источник случайных чисел; в тестах подменяется на предсказуемый
    :return: 7 дней: [{"dayIndex", "isActive", "breakfast", "lunch", "dinner"}],
        где слот — {"dish", "isLeftover", "servingsUsed"} или None
    """
    if active_days is None:
        active_days = list(range(7))

    def with_meal(meal_type: str) -> list:
        return [d for d in dishes if meal_type in (d.get("meal_types") or [])]

    breakfast_dishes = with_meal("breakfast")
    lunch_dishes = with_meal("lunch")
    dinner_dishes = with_meal("dinner")
    lunch_or_dinner = [
        d for d in dishes
        if "lunch" in (d.get("meal_types") or []) or "dinner" in (d.get("meal_types") or [])
    ]

    menu = [
        {"dayIndex": i, "isActive": i in active_days, "breakfast": None, "lunch": None, "dinner": None}
        for i in range(7)
    ]

    state = {"meat_types_used": set(), "used_dish_ids": set(), "hard_count_week": 0}

    # ---------- Завтраки: одно блюдо на пару активных дней ----------
    if breakfast_dishes:
        shuffled = _shuffle(breakfast_dishes, rng)
        for i, day in enumerate(active_days):
            dish = shuffled[(i // 2) % len(shuffled)]
            is_leftover = i % 2 == 1
            has_pair = is_leftover or i + 1 < len(active_days)
            menu[day]["breakfast"] = {"dish": dish, "isLeftover": is_leftover, "servingsUsed": 2 if has_pair else 1}
            if dish.get("meat_type") in MEAT_TYPES_TRACKABLE:
                state["meat_types_used"].add(dish["meat_type"])

    # ---------- Обеды ----------
    lunch_state = _copy_state(state)
    lunch_plan = _plan_meal_slots(lunch_dishes or lunch_or_dinner, active_days, rng, lunch_state)
    lunch_queue = _expand_plan(lunch_plan)
    state = lunch_state

    # ---------- Ужины ----------
    dinner_state = _copy_state(state)
    dinner_plan = _plan_meal_slots(dinner_dishes or lunch_or_dinner, active_days, rng, dinner_state)
    dinner_queue = _expand_plan(dinner_plan)

    for i, day in enumerate(active_days):
        if i < len(lunch_queue):
            menu[day]["lunch"] = lunch_queue[i]
        if i < len(dinner_queue):
            menu[day]["dinner"] = dinner_queue[i]

    _cluster_by_ingredients(menu)
    return menu


# ---------- Кластеризация по ингредиентам ----------

def _window_of(day: int) -> int:
    """Трёхдневный период: Пн–Ср = 0, Чт–Сб = 1, Вс = 2."""
    return day // 3


def _can_start_on(dish: dict, day: int) -> bool:
    return not dish.get("weekends_only") or IS_WEEKEND[day]


def _norm(name) -> str:
    return (name or "").lower().strip().replace("ё", "е")


def _shared_ingredients(dish_a: dict, dish_b: dict) -> list:
    names_a = {_norm(i.get("name")) for i in dish_a.get("ingredients") or []}
    return [i for i in dish_b.get("ingredients") or [] if _norm(i.get("name")) in names_a]


def _build_cooking_blocks(menu: list) -> list:
    """Блок = день готовки + идущие за ним дни остатков того же блюда в том же приёме пищи."""
    blocks = []
    for meal_type in MEAL_TYPES:
        current = None
        for day in range(7):
            if not menu[day]["isActive"]:
                continue
            slot = menu[day][meal_type]
            if not slot:
                current = None
            elif not slot["isLeftover"]:
                current = {"mealType": meal_type, "days": [day], "dish": slot["dish"]}
                blocks.append(current)
            elif current and current["dish"]["id"] == slot["dish"]["id"]:
                current["days"].append(day)
            else:
                current = None
    return blocks


def _swap_blocks(menu: list, b: dict, c: dict) -> None:
    b_slots = [menu[d][b["mealType"]] for d in b["days"]]
    c_slots = [menu[d][c["mealType"]] for d in c["days"]]
    for k, d in enumerate(b["days"]):
        menu[d][b["mealType"]] = c_slots[k]
    for k, d in enumerate(c["days"]):
        menu[d][c["mealType"]] = b_slots[k]
    b["dish"], c["dish"] = c["dish"], b["dish"]


def _cluster_by_ingredients(menu: list) -> None:
    """Сдвигает блюда с общими ингредиентами в один 3-дневный период.

    Двигаем блоки целиком и меняем местами только блоки одинаковой длины
    в одном приёме пищи — так остатки никогда не окажутся раньше готовки.
    """
    blocks = _build_cooking_blocks(menu)

    for i, a in enumerate(blocks):
        for b in blocks[i + 1:]:
            target_window = _window_of(a["days"][0])
            if target_window == _window_of(b["days"][0]):
                continue
            if not _shared_ingredients(a["dish"], b["dish"]):
                continue

            c = next(
                (
                    x for x in blocks
                    if x is not a and x is not b
                    and x["mealType"] == b["mealType"]
                    and len(x["days"]) == len(b["days"])
                    and _window_of(x["days"][0]) == target_window
                    and _can_start_on(b["dish"], x["days"][0])
                    and _can_start_on(x["dish"], b["days"][0])
                    and not _shared_ingredients(a["dish"], x["dish"])
                ),
                None,
            )
            if c is not None:
                _swap_blocks(menu, b, c)


def menu_to_plan(menu: list) -> list:
    """Компактный ответ для сайта: вместо блюда целиком — только его id."""
    def slot_out(slot):
        if not slot:
            return None
        return {"dishId": slot["dish"]["id"], "isLeftover": slot["isLeftover"], "servingsUsed": slot["servingsUsed"]}

    return [
        {"dayIndex": day["dayIndex"], **{mt: slot_out(day[mt]) for mt in MEAL_TYPES}}
        for day in menu
    ]
