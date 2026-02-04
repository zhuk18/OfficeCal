from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select, delete as sql_delete
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from . import models
from .utils import month_days, weekday_name, is_weekend

logger = logging.getLogger(__name__)


def get_or_create_month(db: Session, year: int, month: int) -> models.CalendarMonth:
    """
    Get or create a calendar month with all its days.
    
    Args:
        db: Database session
        year: Year (e.g., 2024)
        month: Month (1-12)
    
    Returns:
        CalendarMonth object with populated days
    
    Raises:
        IntegrityError: If concurrent creation fails
    """
    # Try to fetch existing month
    month_obj = db.scalar(
        select(models.CalendarMonth).where(
            models.CalendarMonth.year == year,
            models.CalendarMonth.month == month,
        )
    )
    if month_obj:
        return month_obj

    # Create new month
    month_obj = models.CalendarMonth(year=year, month=month, is_locked=False)
    db.add(month_obj)
    
    try:
        db.flush()
    except IntegrityError:
        # Handle race condition - another process created it
        db.rollback()
        month_obj = db.scalar(
            select(models.CalendarMonth).where(
                models.CalendarMonth.year == year,
                models.CalendarMonth.month == month,
            )
        )
        if month_obj:
            logger.info(f"Month {year}-{month:02d} already exists (race condition)")
            return month_obj
        raise

    # Create all days for the month
    for day in month_days(year, month):
        day_obj = models.CalendarDay(
            month_id=month_obj.id,
            date=day,
            weekday_name=weekday_name(day),
            is_weekend=is_weekend(day),
            is_holiday=False,
        )
        db.add(day_obj)

    db.commit()
    db.refresh(month_obj)
    logger.info(f"Created month {year}-{month:02d} with {len(month_obj.days)} days")
    return month_obj


def upsert_user_day_status(
    db: Session,
    user_id: int,
    day: models.CalendarDay,
    status: models.DayStatus,
) -> models.UserDayStatus:
    """
    Create or update user's day status.
    
    Args:
        db: Database session
        user_id: User ID
        day: CalendarDay object
        status: DayStatus enum value
    
    Returns:
        UserDayStatus object (created or updated)
    """
    existing = db.scalar(
        select(models.UserDayStatus).where(
            models.UserDayStatus.user_id == user_id,
            models.UserDayStatus.day_id == day.id,
        )
    )
    if existing:
        existing.status = status
        db.add(existing)
        return existing

    new_status = models.UserDayStatus(user_id=user_id, day_id=day.id, status=status)
    db.add(new_status)
    return new_status


def count_remote_days(db: Session, user_id: int, year: int) -> int:
    """
    Count total remote work days for a user in a year.
    
    Args:
        db: Database session
        user_id: User ID
        year: Year to count
    
    Returns:
        Number of remote work days
    """
    result = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .join(models.CalendarMonth)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarMonth.year == year)
        .where(models.UserDayStatus.status == models.DayStatus.remote)
    ).unique().all()
    return len(result)


def count_vacation_days(
    db: Session,
    user_id: int,
    year: int,
    month: int | None = None,
) -> int:
    """
    Count vacation days for a user.
    
    Args:
        db: Database session
        user_id: User ID
        year: Year to count
        month: Optional month to filter (1-12)
    
    Returns:
        Number of vacation days
    """
    query = (
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .join(models.CalendarMonth)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarMonth.year == year)
        .where(models.UserDayStatus.status == models.DayStatus.vacation)
    )
    
    if month is not None:
        query = query.where(models.CalendarMonth.month == month)
    
    result = db.scalars(query).unique().all()
    return len(result)


def get_vacation_dates(db: Session, user_id: int, year: int) -> list[date]:
    """
    Get all vacation dates for a user in a year.
    
    Args:
        db: Database session
        user_id: User ID
        year: Year to query
    
    Returns:
        List of dates marked as vacation, sorted chronologically
    """
    result = db.scalars(
        select(models.CalendarDay.date)
        .join(models.UserDayStatus, models.UserDayStatus.day_id == models.CalendarDay.id)
        .join(models.CalendarMonth, models.CalendarDay.month_id == models.CalendarMonth.id)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarMonth.year == year)
        .where(models.UserDayStatus.status == models.DayStatus.vacation)
        .order_by(models.CalendarDay.date)
    ).all()
    return list(result)


def count_remote_days_until(db: Session, user_id: int, year: int, end_date: date) -> int:
    """
    Count remote work days for a user up to a specific date.
    
    Args:
        db: Database session
        user_id: User ID
        year: Year to count
        end_date: End date (inclusive)
    
    Returns:
        Number of remote work days from year start to end_date
    """
    year_start = date(year, 1, 1)
    if end_date < year_start:
        return 0
    
    result = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.UserDayStatus.status == models.DayStatus.remote)
        .where(models.CalendarDay.date >= year_start)
        .where(models.CalendarDay.date <= end_date)
    ).unique().all()
    return len(result)


def get_statuses_for_user_month(
    db: Session,
    user_id: int,
    month: models.CalendarMonth,
) -> dict[date, models.DayStatus]:
    """
    Get all day statuses for a specific user in a month.
    
    Args:
        db: Database session
        user_id: User ID
        month: CalendarMonth object
    
    Returns:
        Dictionary mapping date to DayStatus
    """
    statuses = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarDay.month_id == month.id)
    ).unique().all()
    return {s.day.date: s.status for s in statuses}


def get_statuses_for_month(
    db: Session,
    month: models.CalendarMonth,
) -> dict[int, dict[date, models.DayStatus]]:
    """
    Get all day statuses for all users in a month.
    
    Args:
        db: Database session
        month: CalendarMonth object
    
    Returns:
        Dictionary mapping user_id to dict of date to DayStatus
    """
    statuses = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.CalendarDay.month_id == month.id)
    ).unique().all()
    result: dict[int, dict[date, models.DayStatus]] = {}
    for entry in statuses:
        result.setdefault(entry.user_id, {})[entry.day.date] = entry.status
    return result


def get_notes_for_month(
    db: Session,
    month: models.CalendarMonth,
) -> dict[int, dict[date, str | None]]:
    """
    Get all notes for all users in a month.
    
    Args:
        db: Database session
        month: CalendarMonth object
    
    Returns:
        Dictionary mapping user_id to dict of date to note text
    """
    statuses = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.CalendarDay.month_id == month.id)
    ).unique().all()
    result: dict[int, dict[date, str | None]] = {}
    for entry in statuses:
        result.setdefault(entry.user_id, {})[entry.day.date] = entry.note
    return result


def delete_user_month_statuses(
    db: Session,
    user_id: int,
    month: models.CalendarMonth,
) -> None:
    """
    Delete all status entries for a user in a specific month.
    
    Args:
        db: Database session
        user_id: User ID
        month: CalendarMonth object
    """
    day_ids = [day.id for day in month.days]
    stmt = sql_delete(models.UserDayStatus).where(
        models.UserDayStatus.user_id == user_id,
        models.UserDayStatus.day_id.in_(day_ids),
    )
    db.execute(stmt)
    logger.debug(f"Deleted statuses for user {user_id} in month {month.year}-{month.month:02d}")

