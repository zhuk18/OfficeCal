from __future__ import annotations

from datetime import date, timedelta
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select

from .database import Base, SessionLocal, engine
from . import crud, models, schemas

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OfficeCal MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
):
    if x_user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-User-Id")
    user = db.get(models.User, x_user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown user")
    return user


def require_admin(user: models.User = Depends(get_current_user)):
    if user.role != models.Role.admin:
        db = SessionLocal()
        try:
            user_count = db.query(models.User).count()
        finally:
            db.close()
        if user_count > 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/departments", response_model=schemas.DepartmentOut)
def create_department(
    payload: schemas.DepartmentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    dept = models.Department(name=payload.name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@app.get("/departments", response_model=list[schemas.DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return db.query(models.Department).order_by(models.Department.name).all()


@app.post("/users", response_model=schemas.UserOut)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    try:
        payload_dict = payload.model_dump()
        vacation_days = payload_dict.pop("vacation_days", None)
        
        user = models.User(**payload_dict)
        db.add(user)
        db.flush()
        
        # Add vacation day types if provided
        if vacation_days:
            for vacation_type, days_per_year in vacation_days.items():
                vacation_entry = models.UserVacationDays(
                    user_id=user.id,
                    vacation_type=vacation_type,
                    days_per_year=days_per_year,
                )
                db.add(vacation_entry)
        
        db.commit()
        db.refresh(user)
        db.refresh(user, ["vacation_days"])
        return user
    except Exception as e:
        db.rollback()
        print(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.display_name).all()


@app.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    try:
        user = db.get(models.User, user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
        # Update only provided fields
        update_data = payload.model_dump(exclude_unset=True)
        vacation_days = update_data.pop("vacation_days", None)
        
        for key, value in update_data.items():
            setattr(user, key, value)
        
        # Update vacation day types if provided
        if vacation_days is not None:
            # Delete existing vacation day types
            existing = db.query(models.UserVacationDays).filter(
                models.UserVacationDays.user_id == user_id
            ).all()
            for entry in existing:
                db.delete(entry)
            db.flush()  # Flush deletes before adding new entries
            
            # Add new vacation day types
            for vacation_type, days_per_year in vacation_days.items():
                vacation_entry = models.UserVacationDays(
                    user_id=user_id,
                    vacation_type=vacation_type,
                    days_per_year=days_per_year,
                )
                db.add(vacation_entry)
        
        db.add(user)
        db.commit()
        db.refresh(user)
        db.refresh(user, ["vacation_days"])
        return user
    except Exception as e:
        db.rollback()
        print(f"Error updating user {user_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.delete("/users/{user_id}", response_model=dict)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    db.query(models.UserDayStatus).filter(models.UserDayStatus.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(models.AnnualRemoteCounter).filter(
        models.AnnualRemoteCounter.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(models.UserVacationDays).filter(
        models.UserVacationDays.user_id == user_id
    ).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    return {"status": "deleted"}


@app.get("/months/{year}/{month}", response_model=schemas.CalendarMonthOut)
def get_month(year: int, month: int, db: Session = Depends(get_db)):
    return crud.get_or_create_month(db, year, month)


@app.post("/months/{year}/{month}/lock", response_model=schemas.CalendarMonthOut)
def lock_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    month_obj = crud.get_or_create_month(db, year, month)
    month_obj.is_locked = True
    db.add(month_obj)
    db.commit()
    db.refresh(month_obj)
    return month_obj


@app.post("/months/{year}/{month}/unlock", response_model=schemas.CalendarMonthOut)
def unlock_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    month_obj = crud.get_or_create_month(db, year, month)
    month_obj.is_locked = False
    db.add(month_obj)
    db.commit()
    db.refresh(month_obj)
    return month_obj


@app.get("/users/{user_id}/calendar/{year}/{month}", response_model=schemas.UserCalendarOut)
def get_user_calendar(
    user_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    month_obj = crud.get_or_create_month(db, year, month)
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    items = [
        schemas.UserDayStatusOut(date=day, status=status)
        for day, status in crud.get_statuses_for_user_month(db, user_id, month_obj).items()
    ]
    return schemas.UserCalendarOut(user=user, month=month_obj, items=items)


@app.put("/users/{user_id}/calendar/{year}/{month}", response_model=schemas.UserCalendarOut)
def update_user_calendar(
    user_id: int,
    year: int,
    month: int,
    payload: schemas.UserCalendarUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    month_obj = crud.get_or_create_month(db, year, month)
    if month_obj.is_locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Month locked")
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Delete all existing entries for this user and month first
    crud.delete_user_month_statuses(db, user_id, month_obj)

    # Then add the new ones
    day_by_date = {day.date: day for day in month_obj.days}
    for item in payload.items:
        day = day_by_date.get(item.date)
        if not day:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid date {item.date}")
        crud.upsert_user_day_status(db, user_id, day, item.status)

    db.commit()
    items = [
        schemas.UserDayStatusOut(date=day, status=status)
        for day, status in crud.get_statuses_for_user_month(db, user_id, month_obj).items()
    ]
    return schemas.UserCalendarOut(user=user, month=month_obj, items=items)


@app.get("/calendar/{year}/{month}", response_model=schemas.TeamCalendarOut)
def get_team_calendar(year: int, month: int, db: Session = Depends(get_db)):
    month_obj = crud.get_or_create_month(db, year, month)
    users = db.query(models.User).order_by(models.User.display_name).all()
    status_map = crud.get_statuses_for_month(db, month_obj)
    notes_map = crud.get_notes_for_month(db, month_obj)

    month_start = min(day.date for day in month_obj.days)
    month_end = max(day.date for day in month_obj.days)
    start_end_date = month_start - timedelta(days=1)

    rows: list[schemas.TeamRowOut] = []
    for user in users:
        used_before_month = crud.count_remote_days_until(db, user.id, year, start_end_date)
        used_through_month = crud.count_remote_days_until(db, user.id, year, month_end)
        limit = user.annual_remote_limit or 100
        remaining_start = limit - used_before_month
        remaining_end = limit - used_through_month
        rows.append(
            schemas.TeamRowOut(
                user=user,
                statuses=status_map.get(user.id, {}),
                notes=notes_map.get(user.id, {}),
                remote_remaining_start=remaining_start,
                remote_remaining_end=remaining_end,
            )
        )

    return schemas.TeamCalendarOut(month=month_obj, rows=rows)


@app.put("/months/{year}/{month}/days/{day_date}/workday", response_model=schemas.CalendarDayOut)
def set_workday_override(
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")

    is_workday_override = bool(payload.get("is_workday_override"))
    day.is_workday_override = is_workday_override
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@app.put("/months/{year}/{month}/days/{day_date}/holiday", response_model=schemas.CalendarDayOut)
def set_holiday(
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")

    is_holiday = bool(payload.get("is_holiday"))
    day.is_holiday = is_holiday
    db.add(day)
    db.commit()
    db.refresh(day)
    return day


@app.put("/users/{user_id}/calendar/{year}/{month}/{day_date}/note", response_model=dict)
def update_day_note(
    user_id: int,
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Admin endpoint to update a note for a specific day"""
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")
    
    user_day_status = db.scalar(
        select(models.UserDayStatus)
        .where(models.UserDayStatus.user_id == user_id)
        .where(models.UserDayStatus.day_id == day.id)
    )

    status_value = payload.get("status")
    if status_value == "clear":
        if user_day_status:
            db.delete(user_day_status)
            db.commit()
        return {"success": True, "note": None, "status": None}
    
    if not user_day_status:
        # If no status exists, create one
        if status_value:
            try:
                status_enum = models.DayStatus(status_value)
            except ValueError:
                status_enum = models.DayStatus.office
        else:
            status_enum = models.DayStatus.office

        user_day_status = models.UserDayStatus(
            user_id=user_id,
            day_id=day.id,
            status=status_enum,
            note=payload.get("note")
        )
        db.add(user_day_status)
    else:
        if status_value:
            try:
                user_day_status.status = models.DayStatus(status_value)
            except ValueError:
                pass
        user_day_status.note = payload.get("note")
        db.add(user_day_status)
    
    db.commit()
    db.refresh(user_day_status)
    return {"success": True, "note": user_day_status.note, "status": user_day_status.status.value}


@app.get("/who-is-in-office", response_model=schemas.WhoIsInOfficeOut)
def who_is_in_office(target_date: date, db: Session = Depends(get_db)):
    month_obj = crud.get_or_create_month(db, target_date.year, target_date.month)
    day = next((d for d in month_obj.days if d.date == target_date), None)
    if not day:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found")

    users = db.query(models.User).all()
    by_status: dict[models.DayStatus, list[models.User]] = {status: [] for status in models.DayStatus}

    statuses = db.query(models.UserDayStatus).filter(models.UserDayStatus.day_id == day.id).all()
    status_map = {s.user_id: s.status for s in statuses}

    for user in users:
        status_value = status_map.get(user.id, models.DayStatus.office)
        by_status[status_value].append(user)

    return schemas.WhoIsInOfficeOut(date=target_date, by_status=by_status)


@app.get("/me/remote-counter", response_model=schemas.RemoteCounterOut)
def get_remote_counter(
    year: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    used = crud.count_remote_days(db, current_user.id, year)
    remaining = current_user.annual_remote_limit - used
    return schemas.RemoteCounterOut(
        year=year,
        used=used,
        limit=current_user.annual_remote_limit,
        remaining=remaining,
    )


@app.get("/me/vacation-counter", response_model=schemas.VacationCounterOut)
def get_vacation_counter(
    year: int,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from . import utils
    
    # Accrued days in the current year
    accrued = utils.calculate_vacation_days_accrued(
        current_user.start_date, 
        year, 
        12
    )
    
    # Add additional vacation days
    accrued += current_user.additional_vacation_days
    
    # Add carryover days from previous year
    accrued += current_user.carryover_vacation_days
    
    # Used days in the entire year
    used = crud.count_vacation_days(db, current_user.id, year)
    remaining = max(accrued - used, 0)
    
    return schemas.VacationCounterOut(
        year=year,
        allowed=accrued,
        used=used,
        remaining=remaining,
    )


@app.get("/users/{user_id}/vacation-dates", response_model=list[date])
def get_user_vacation_dates(
    user_id: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return crud.get_vacation_dates(db, user_id, year)
