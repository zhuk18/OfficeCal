from __future__ import annotations

from datetime import date
from pydantic import BaseModel, Field
from .models import DayStatus, Role


class DepartmentBase(BaseModel):
    name: str


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentOut(DepartmentBase):
    id: int

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    display_name: str
    email: str
    role: Role = Role.employee
    annual_remote_limit: int = 100
    start_date: date | None = None
    additional_vacation_days: int = 0
    carryover_vacation_days: int = 0
    department_id: int | None = None


class UserCreate(UserBase):
    vacation_days: dict[str, int] | None = None


class UserUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role: Role | None = None
    annual_remote_limit: int | None = None
    start_date: date | None = None
    additional_vacation_days: int | None = None
    carryover_vacation_days: int | None = None
    department_id: int | None = None
    vacation_days: dict[str, int] | None = None


class UserOut(UserBase):
    id: int
    department: DepartmentOut | None = None
    vacation_days: list[UserVacationDaysOut] = []

    class Config:
        from_attributes = True


class UserVacationDaysOut(BaseModel):
    vacation_type: str
    days_per_year: int

    class Config:
        from_attributes = True


class CalendarDayOut(BaseModel):
    id: int
    date: date
    weekday_name: str
    is_weekend: bool
    is_holiday: bool
    is_workday_override: bool

    class Config:
        from_attributes = True


class CalendarMonthOut(BaseModel):
    id: int
    year: int
    month: int
    is_locked: bool
    days: list[CalendarDayOut]

    class Config:
        from_attributes = True


class DayStatusUpdate(BaseModel):
    date: date
    status: DayStatus
    note: str | None = None


class UserCalendarUpdate(BaseModel):
    items: list[DayStatusUpdate] = Field(default_factory=list)


class UserDayStatusOut(BaseModel):
    date: date
    status: DayStatus
    note: str | None = None


class UserCalendarOut(BaseModel):
    user: UserOut
    month: CalendarMonthOut
    items: list[UserDayStatusOut]


class TeamRowOut(BaseModel):
    user: UserOut
    statuses: dict[date, DayStatus | None]
    notes: dict[date, str | None]
    remote_remaining_start: int
    remote_remaining_end: int


class TeamCalendarOut(BaseModel):
    month: CalendarMonthOut
    rows: list[TeamRowOut]


class RemoteCounterOut(BaseModel):
    year: int
    used: int
    limit: int
    remaining: int


class VacationCounterOut(BaseModel):
    year: int
    allowed: int
    used: int
    remaining: int


class WhoIsInOfficeOut(BaseModel):
    date: date
    by_status: dict[DayStatus, list[UserOut]]
