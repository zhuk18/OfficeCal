from __future__ import annotations

import calendar
from datetime import date


def month_days(year: int, month: int) -> list[date]:
    last_day = calendar.monthrange(year, month)[1]
    return [date(year, month, day) for day in range(1, last_day + 1)]


def weekday_name(day: date) -> str:
    return day.strftime("%a")


def is_weekend(day: date) -> bool:
    return day.weekday() >= 5
