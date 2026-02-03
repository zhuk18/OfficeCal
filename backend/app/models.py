from __future__ import annotations

import enum
from datetime import date
from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(str, enum.Enum):
    employee = "employee"
    manager = "manager"
    admin = "admin"


class DayStatus(str, enum.Enum):
    office = "office"
    remote = "remote"
    vacation = "vacation"
    night = "night"
    trip = "trip"
    absent = "absent"


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    users: Mapped[list[User]] = relationship("User", back_populates="department")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    display_name: Mapped[str] = mapped_column(String(160), index=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.employee)
    annual_remote_limit: Mapped[int] = mapped_column(Integer, default=100)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    additional_vacation_days: Mapped[int] = mapped_column(Integer, default=0)
    carryover_vacation_days: Mapped[int] = mapped_column(Integer, default=0)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))

    department: Mapped[Department | None] = relationship("Department", back_populates="users")
    statuses: Mapped[list[UserDayStatus]] = relationship("UserDayStatus", back_populates="user")
    vacation_days: Mapped[list[UserVacationDays]] = relationship("UserVacationDays", back_populates="user")


class CalendarMonth(Base):
    __tablename__ = "calendar_months"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    month: Mapped[int] = mapped_column(Integer, index=True)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    days: Mapped[list[CalendarDay]] = relationship("CalendarDay", back_populates="month")


class CalendarDay(Base):
    __tablename__ = "calendar_days"
    __table_args__ = (UniqueConstraint("month_id", "date", name="uq_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month_id: Mapped[int] = mapped_column(ForeignKey("calendar_months.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    weekday_name: Mapped[str] = mapped_column(String(12))
    is_weekend: Mapped[bool] = mapped_column(Boolean, default=False)
    is_holiday: Mapped[bool] = mapped_column(Boolean, default=False)
    is_workday_override: Mapped[bool] = mapped_column(Boolean, default=False)

    month: Mapped[CalendarMonth] = relationship("CalendarMonth", back_populates="days")
    statuses: Mapped[list[UserDayStatus]] = relationship("UserDayStatus", back_populates="day")


class UserDayStatus(Base):
    __tablename__ = "user_day_statuses"
    __table_args__ = (UniqueConstraint("user_id", "day_id", name="uq_user_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    day_id: Mapped[int] = mapped_column(ForeignKey("calendar_days.id"))
    status: Mapped[DayStatus] = mapped_column(Enum(DayStatus))
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="statuses")
    day: Mapped[CalendarDay] = relationship("CalendarDay", back_populates="statuses")


class AnnualRemoteCounter(Base):
    __tablename__ = "annual_remote_counters"
    __table_args__ = (UniqueConstraint("user_id", "year", name="uq_counter"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    year: Mapped[int] = mapped_column(Integer, index=True)
    used_days: Mapped[int] = mapped_column(Integer, default=0)

class UserVacationDays(Base):
    __tablename__ = "user_vacation_days"
    __table_args__ = (UniqueConstraint("user_id", "vacation_type", name="uq_user_vacation_type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    vacation_type: Mapped[str] = mapped_column(String(50))
    days_per_year: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship("User", back_populates="vacation_days")