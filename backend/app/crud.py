from __future__ import annotations

from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .utils import month_days, weekday_name, is_weekend


def get_or_create_month(db: Session, year: int, month: int) -> models.CalendarMonth:
    from sqlalchemy.exc import IntegrityError
    
    month_obj = db.scalar(
        select(models.CalendarMonth).where(
            models.CalendarMonth.year == year,
            models.CalendarMonth.month == month,
        )
    )
    if month_obj:
        return month_obj

    month_obj = models.CalendarMonth(year=year, month=month, is_locked=False)
    db.add(month_obj)
    
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        month_obj = db.scalar(
            select(models.CalendarMonth).where(
                models.CalendarMonth.year == year,
                models.CalendarMonth.month == month,
            )
        )
        if month_obj:
            return month_obj
        raise

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
    return month_obj


def upsert_user_day_status(
    db: Session,
    user_id: int,
    day: models.CalendarDay,
    status: models.DayStatus,
) -> models.UserDayStatus:
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
    result = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .join(models.CalendarMonth)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarMonth.year == year)
        .where(models.UserDayStatus.status == models.DayStatus.remote)
    ).all()
    return len(result)


def count_remote_days_until(db: Session, user_id: int, year: int, end_date: date) -> int:
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
    ).all()
    return len(result)


def get_statuses_for_user_month(
    db: Session,
    user_id: int,
    month: models.CalendarMonth,
) -> dict[date, models.DayStatus]:
    statuses = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.CalendarDay.month_id == month.id)
    ).all()
    return {s.day.date: s.status for s in statuses}


def get_statuses_for_month(
    db: Session,
    month: models.CalendarMonth,
) -> dict[int, dict[date, models.DayStatus]]:
    statuses = db.scalars(
        select(models.UserDayStatus)
        .join(models.CalendarDay)
        .where(models.CalendarDay.month_id == month.id)
    ).all()
    result: dict[int, dict[date, models.DayStatus]] = {}
    for entry in statuses:
        result.setdefault(entry.user_id, {})[entry.day.date] = entry.status
    return result


def delete_user_month_statuses(db: Session, user_id: int, month: models.CalendarMonth) -> None:
    """Delete all status entries for a user in a specific month."""
    from sqlalchemy import delete
    
    day_ids = [day.id for day in month.days]
    stmt = delete(models.UserDayStatus).where(
        models.UserDayStatus.user_id == user_id,
        models.UserDayStatus.day_id.in_(day_ids)
    )
    db.execute(stmt)

