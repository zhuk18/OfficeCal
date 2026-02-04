from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from .models import DayStatus, Role


class DepartmentBase(BaseModel):
    """Base schema for department."""
    name: Annotated[str, Field(min_length=1, max_length=120, description="Department name")]


class DepartmentCreate(DepartmentBase):
    """Schema for creating a department."""
    pass


class DepartmentOut(DepartmentBase):
    """Schema for department output."""
    id: int

    model_config = ConfigDict(from_attributes=True)


class UserBase(BaseModel):
    """Base schema for user."""
    display_name: Annotated[str, Field(min_length=1, max_length=160, description="User's display name")]
    email: Annotated[EmailStr, Field(description="User's email address")]
    role: Annotated[Role, Field(default=Role.employee, description="User's role")]
    annual_remote_limit: Annotated[int, Field(default=100, ge=0, le=365, description="Annual remote work days limit")]
    start_date: Annotated[date | None, Field(default=None, description="Employment start date")]
    additional_vacation_days: Annotated[int, Field(default=0, ge=0, description="Additional vacation days granted")]
    carryover_vacation_days: Annotated[int, Field(default=0, ge=0, description="Vacation days carried over from previous year")]
    department_id: Annotated[int | None, Field(default=None, description="Department ID")]


class UserCreate(UserBase):
    """Schema for creating a user."""
    vacation_days: Annotated[
        dict[str, int] | None,
        Field(default=None, description="Vacation types and days per year")
    ]


class UserUpdate(BaseModel):
    """Schema for updating a user. All fields are optional."""
    display_name: Annotated[str | None, Field(default=None, min_length=1, max_length=160)]
    email: Annotated[EmailStr | None, Field(default=None)]
    role: Annotated[Role | None, Field(default=None)]
    annual_remote_limit: Annotated[int | None, Field(default=None, ge=0, le=365)]
    start_date: Annotated[date | None, Field(default=None)]
    additional_vacation_days: Annotated[int | None, Field(default=None, ge=0)]
    carryover_vacation_days: Annotated[int | None, Field(default=None, ge=0)]
    department_id: Annotated[int | None, Field(default=None)]
    vacation_days: Annotated[dict[str, int] | None, Field(default=None)]


class UserVacationDaysOut(BaseModel):
    """Schema for user vacation days output."""
    vacation_type: str
    days_per_year: Annotated[int, Field(ge=0)]

    model_config = ConfigDict(from_attributes=True)


class UserOut(UserBase):
    """Schema for user output."""
    id: int
    department: DepartmentOut | None = None
    vacation_days: list[UserVacationDaysOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CalendarDayOut(BaseModel):
    """Schema for calendar day output."""
    id: int
    date: date
    weekday_name: Annotated[str, Field(description="Weekday name (e.g., Mon, Tue)")]
    is_weekend: bool
    is_holiday: bool
    is_workday_override: bool

    model_config = ConfigDict(from_attributes=True)


class CalendarMonthOut(BaseModel):
    """Schema for calendar month output."""
    id: int
    year: Annotated[int, Field(ge=2000, le=2100, description="Year")]
    month: Annotated[int, Field(ge=1, le=12, description="Month (1-12)")]
    is_locked: bool
    days: list[CalendarDayOut]

    model_config = ConfigDict(from_attributes=True)


class DayStatusUpdate(BaseModel):
    """Schema for updating day status."""
    date: date
    status: DayStatus
    note: Annotated[str | None, Field(default=None, max_length=500, description="Optional note")]


class UserCalendarUpdate(BaseModel):
    """Schema for batch updating user calendar."""
    items: list[DayStatusUpdate] = Field(default_factory=list, description="List of day status updates")


class UserDayStatusOut(BaseModel):
    """Schema for user day status output."""
    date: date
    status: DayStatus
    note: Annotated[str | None, Field(default=None)]


class UserCalendarOut(BaseModel):
    """Schema for user calendar output."""
    user: UserOut
    month: CalendarMonthOut
    items: list[UserDayStatusOut]


class TeamRowOut(BaseModel):
    """Schema for team calendar row output."""
    user: UserOut
    statuses: dict[date, DayStatus | None]
    notes: dict[date, str | None]
    remote_remaining_start: Annotated[int, Field(description="Remote days remaining at month start")]
    remote_remaining_end: Annotated[int, Field(description="Remote days remaining at month end")]


class TeamCalendarOut(BaseModel):
    """Schema for team calendar output."""
    month: CalendarMonthOut
    rows: list[TeamRowOut]


class RemoteCounterOut(BaseModel):
    """Schema for remote work counter output."""
    year: Annotated[int, Field(description="Year")]
    used: Annotated[int, Field(ge=0, description="Remote days used")]
    limit: Annotated[int, Field(ge=0, description="Annual remote day limit")]
    remaining: Annotated[int, Field(description="Remote days remaining")]


class VacationCounterOut(BaseModel):
    """Schema for vacation counter output."""
    year: Annotated[int, Field(description="Year")]
    allowed: Annotated[int, Field(ge=0, description="Vacation days allowed")]
    used: Annotated[int, Field(ge=0, description="Vacation days used")]
    remaining: Annotated[int, Field(ge=0, description="Vacation days remaining")]


class WhoIsInOfficeOut(BaseModel):
    """Schema for who-is-in-office output."""
    date: date
    by_status: dict[DayStatus, list[UserOut]]
