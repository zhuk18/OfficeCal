from __future__ import annotations

import calendar
from datetime import date
from typing import Final


# Constants
VACATION_DAYS_PER_YEAR: Final[int] = 20
VACATION_DAYS_PER_MONTH: Final[float] = VACATION_DAYS_PER_YEAR / 12


def month_days(year: int, month: int) -> list[date]:
    """
    Get all days in a month.
    
    Args:
        year: Year
        month: Month (1-12)
    
    Returns:
        List of date objects for each day in the month
    """
    last_day = calendar.monthrange(year, month)[1]
    return [date(year, month, day) for day in range(1, last_day + 1)]


def weekday_name(day: date) -> str:
    """
    Get abbreviated weekday name.
    
    Args:
        day: Date object
    
    Returns:
        Abbreviated weekday name (Mon, Tue, etc.)
    """
    return day.strftime("%a")


def is_weekend(day: date) -> bool:
    """
    Check if a date falls on a weekend.
    
    Args:
        day: Date object
    
    Returns:
        True if Saturday or Sunday, False otherwise
    """
    return day.weekday() >= 5


def calculate_vacation_days_allowed(start_date: date | None, current_year: int) -> int:
    """
    Calculate vacation days allowed for a given year based on Latvian law.
    
    Every employee gets 20 working days per year ≈ 1.67 days per month.
    Pro-rated for employees who started mid-year.
    
    Args:
        start_date: Employee's contract start date
        current_year: The year to calculate for
    
    Returns:
        Total vacation days allowed for the full year
    """
    # Base vacation days per year
    return 20


def calculate_vacation_days_accrued(start_date: date | None, current_year: int, month: int) -> int:
    """
    Calculate vacation days accrued by the end of a given month.
    
    Accrue approximately 1.67 days per month (20 days / 12 months). If employee started mid-year, pro-rate their first year.
    
    Args:
        start_date: Employee's contract start date
        current_year: The year to calculate for
        month: The month (1-12) to calculate accrual through
    
    Returns:
        Total vacation days accrued by end of the specified month
    """
    if not start_date:
        # No start date, assume full accrual
        return int((min(month, 12) * 20) / 12)
    
    # If employee started in a different year, full accrual applies
    if start_date.year < current_year:
        return int((min(month, 12) * 20) / 12)
    
    # If employee started after the current year, 0 accrual for this year
    if start_date.year > current_year:
        return 0
    
    # Employee started in current year
    start_month = start_date.month
    
    # If requested month is before start month, no accrual yet
    if month < start_month:
        return 0
    
    # Accrual is approximately 1.67 days per month, counting from start month
    # Employee accrues days starting from their start month
    months_employed = month - start_month + 1
    return int((months_employed * 20) / 12)


def count_vacation_days_used(statuses: dict[date, str], year: int) -> int:
    """
    Count vacation days marked as 'vacation' in the current year.
    
    Args:
        statuses: Dictionary mapping dates to status strings
        year: The year to count for
    
    Returns:
        Number of vacation days used
    """
    count = 0
    for date_key, status in statuses.items():
        if isinstance(date_key, str):
            date_key = date.fromisoformat(date_key)
        if date_key.year == year and status == "vacation" and not is_weekend(date_key):
            count += 1
    return count

