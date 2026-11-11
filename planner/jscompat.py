"""Мелкие функции, которые повторяют поведение JavaScript там, где Python считает иначе.

Нужны, чтобы Python-версия давала ровно те же результаты, что и прежняя JS-версия.
"""
from __future__ import annotations

import math
import re

_FLOAT_PREFIX = re.compile(r"^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")


def js_round(x: float) -> int:
    """Как Math.round в JS: половинки округляются вверх (в Python round(2.5) == 2)."""
    return math.floor(x + 0.5)


def js_parse_float(value) -> float:
    """Как parseFloat в JS: берёт число из начала строки, иначе NaN."""
    if value is None or isinstance(value, bool):
        return math.nan
    if isinstance(value, (int, float)):
        return float(value)
    m = _FLOAT_PREFIX.match(str(value))
    return float(m.group(0)) if m else math.nan
