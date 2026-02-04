from __future__ import annotations

import enum
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(str, enum.Enum):
    """User roles in the system."""
    employee = "employee"
    manager = "manager"
    admin = "admin"


class DayStatus(str, enum.Enum):
    """Status options for a user's day."""
    office = "office"
    remote = "remote"
    vacation = "vacation"
    night = "night"
    trip = "trip"
    absent = "absent"


class Department(Base):
    """Department/team within the organization."""
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)

    # Relationships
    users: Mapped[list[User]] = relationship("User", back_populates="department", lazy="select")

    def __repr__(self) -> str:
        return f"<Department(id={self.id}, name='{self.name}')>"


class User(Base):
    """User/employee in the system."""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_department_id", "department_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.employee, nullable=False)
    annual_remote_limit: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    additional_vacation_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    carryover_vacation_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    department: Mapped[Department | None] = relationship("Department", back_populates="users", lazy="joined")
    statuses: Mapped[list[UserDayStatus]] = relationship(
        "UserDayStatus",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select",
    )
    vacation_days: Mapped[list[UserVacationDays]] = relationship(
        "UserVacationDays",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="joined",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"


class CalendarMonth(Base):
    """Calendar month with days and lock status."""
    __tablename__ = "calendar_months"
    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_year_month"),
        Index("ix_calendar_months_year_month", "year", "month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    month: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    days: Mapped[list[CalendarDay]] = relationship(
        "CalendarDay",
        back_populates="month",
        cascade="all, delete-orphan",
        lazy="joined",
        order_by="CalendarDay.date",
    )

    def __repr__(self) -> str:
        return f"<CalendarMonth(id={self.id}, year={self.year}, month={self.month}, locked={self.is_locked})>"


class CalendarDay(Base):
    """Individual calendar day within a month."""
    __tablename__ = "calendar_days"
    __table_args__ = (
        UniqueConstraint("month_id", "date", name="uq_month_date"),
        Index("ix_calendar_days_date", "date"),
        Index("ix_calendar_days_month_id", "month_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    month_id: Mapped[int] = mapped_column(
        ForeignKey("calendar_months.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    weekday_name: Mapped[str] = mapped_column(String(12), nullable=False)
    is_weekend: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_holiday: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_workday_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    month: Mapped[CalendarMonth] = relationship("CalendarMonth", back_populates="days", lazy="joined")
    statuses: Mapped[list[UserDayStatus]] = relationship(
        "UserDayStatus",
        back_populates="day",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<CalendarDay(id={self.id}, date={self.date}, weekday={self.weekday_name})>"


class UserDayStatus(Base):
    """User's status for a specific day."""
    __tablename__ = "user_day_statuses"
    __table_args__ = (
        UniqueConstraint("user_id", "day_id", name="uq_user_day"),
        Index("ix_user_day_statuses_user_id", "user_id"),
        Index("ix_user_day_statuses_day_id", "day_id"),
        Index("ix_user_day_statuses_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_id: Mapped[int] = mapped_column(
        ForeignKey("calendar_days.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[DayStatus] = mapped_column(Enum(DayStatus), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="statuses", lazy="joined")
    day: Mapped[CalendarDay] = relationship("CalendarDay", back_populates="statuses", lazy="joined")

    def __repr__(self) -> str:
        return f"<UserDayStatus(id={self.id}, user_id={self.user_id}, day_id={self.day_id}, status='{self.status}')>"


class AnnualRemoteCounter(Base):
    """Counter for remote work days per user per year."""
    __tablename__ = "annual_remote_counters"
    __table_args__ = (
        UniqueConstraint("user_id", "year", name="uq_user_year"),
        Index("ix_annual_remote_counters_user_id", "user_id"),
        Index("ix_annual_remote_counters_year", "year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    used_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<AnnualRemoteCounter(id={self.id}, user_id={self.user_id}, year={self.year}, used={self.used_days})>"


class UserVacationDays(Base):
    """Configuration for different vacation types per user."""
    __tablename__ = "user_vacation_days"
    __table_args__ = (
        UniqueConstraint("user_id", "vacation_type", name="uq_user_vacation_type"),
        Index("ix_user_vacation_days_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vacation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    days_per_year: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="vacation_days", lazy="joined")

    def __repr__(self) -> str:
        return f"<UserVacationDays(id={self.id}, user_id={self.user_id}, type='{self.vacation_type}', days={self.days_per_year})>"