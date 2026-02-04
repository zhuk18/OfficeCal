from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from .database import Base, SessionLocal, engine, get_db as database_get_db
from . import crud, models, schemas
from . import seed as seed_module

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Flag to track if tables have been initialized
_tables_initialized = False


def init_db():
    """Initialize database tables on first use."""
    global _tables_initialized
    if not _tables_initialized:
        try:
            Base.metadata.create_all(bind=engine)
            _tables_initialized = True
            logger.info("Database tables initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize database tables: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown."""
    logger.info(f"Starting OfficeCalendar API in {ENVIRONMENT} mode")
    # Defer table creation to lazy initialization
    yield
    logger.info("Shutting down OfficeCalendar API")


app = FastAPI(
    title="OfficeCalendar API",
    description="Office calendar management system",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if ENVIRONMENT == "development" else None,
    redoc_url="/api/redoc" if ENVIRONMENT == "development" else None,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Dependency injection
def get_db() -> Session:
    """Get database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: Session = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> models.User:
    """Get current authenticated user from X-User-Id header."""
    init_db()  # Ensure tables are initialized before using DB
    if x_user_id is None:
        logger.warning("Authentication failed: Missing X-User-Id header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "X-User-Id"},
        )
    
    user = db.scalars(
        select(models.User).where(models.User.id == x_user_id)
    ).first()
    if not user:
        logger.warning(f"Authentication failed: User {x_user_id} not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user credentials",
        )
    
    logger.debug(f"User {user.id} ({user.email}) authenticated")
    return user


def require_admin(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)) -> models.User:
    """Require admin role for accessing the endpoint."""
    if user.role != models.Role.admin:
        # Allow first user to be admin (initial setup)
        user_count = db.query(models.User).count()
        if user_count > 1:
            logger.warning(f"Authorization failed: User {user.id} is not admin")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrator privileges required",
            )
    return user


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Health check endpoint with database connectivity test."""
    try:
        # Test database connectivity
        db.execute(select(1))
        return {
            "status": "healthy",
            "environment": ENVIRONMENT,
            "database": "connected",
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "environment": ENVIRONMENT,
                "database": "disconnected",
            },
        )


@app.post("/admin/seed", response_model=dict, tags=["admin"])
def seed_data(
    db: Session = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
):
    """Seed the database with initial data. Requires admin privileges if users exist."""
    user_count = db.query(models.User).count()
    
    if user_count > 0:
        if x_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )
        user = db.get(models.User, x_user_id)
        if not user or user.role != models.Role.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Administrator privileges required",
            )

    try:
        seed_module.seed()
        logger.info("Database seeded successfully")
        return {"status": "success", "message": "Database seeded"}
    except Exception as e:
        logger.error(f"Seeding failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Seeding failed: {str(e)}",
        )


# Department endpoints
@app.post(
    "/departments",
    response_model=schemas.DepartmentOut,
    status_code=status.HTTP_201_CREATED,
    tags=["departments"],
)
def create_department(
    payload: schemas.DepartmentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Create a new department. Requires admin privileges."""
    try:
        dept = models.Department(name=payload.name)
        db.add(dept)
        db.commit()
        db.refresh(dept)
        logger.info(f"Department created: {dept.name} (ID: {dept.id})")
        return dept
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create department: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create department: {str(e)}",
        )


@app.get("/departments", response_model=list[schemas.DepartmentOut], tags=["departments"])
def list_departments(db: Session = Depends(get_db)):
    """List all departments."""
    return db.query(models.Department).order_by(models.Department.name).all()


# User endpoints
@app.post(
    "/users",
    response_model=schemas.UserOut,
    status_code=status.HTTP_201_CREATED,
    tags=["users"],
)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    """Create a new user with optional vacation days configuration."""
    try:
        payload_dict = payload.model_dump()
        vacation_days = payload_dict.pop("vacation_days", None)
        
        # Check for duplicate email
        existing_user = db.query(models.User).filter(
            models.User.email == payload.email
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with email {payload.email} already exists",
            )
        
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
        logger.info(f"User created: {user.email} (ID: {user.id})")
        return user
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating user: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create user: {str(e)}",
        )


@app.get("/users", response_model=list[schemas.UserOut], tags=["users"])
def list_users(db: Session = Depends(get_db)):
    """List all users."""
    return db.query(models.User).order_by(models.User.display_name).all()


@app.put("/users/{user_id}", response_model=schemas.UserOut, tags=["users"])
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Update an existing user. Requires admin privileges."""
    try:
        user = db.get(models.User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID {user_id} not found",
            )
        
        # Update only provided fields
        update_data = payload.model_dump(exclude_unset=True)
        vacation_days = update_data.pop("vacation_days", None)
        
        # Check email uniqueness if being updated
        if "email" in update_data and update_data["email"] != user.email:
            existing_user = db.query(models.User).filter(
                models.User.email == update_data["email"],
                models.User.id != user_id,
            ).first()
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"User with email {update_data['email']} already exists",
                )
        
        for key, value in update_data.items():
            setattr(user, key, value)
        
        # Update vacation day types if provided
        if vacation_days is not None:
            # Delete existing vacation day types
            db.query(models.UserVacationDays).filter(
                models.UserVacationDays.user_id == user_id
            ).delete(synchronize_session=False)
            db.flush()
            
            # Add new vacation day types
            for vacation_type, days_per_year in vacation_days.items():
                vacation_entry = models.UserVacationDays(
                    user_id=user_id,
                    vacation_type=vacation_type,
                    days_per_year=days_per_year,
                )
                db.add(vacation_entry)
        
        db.commit()
        db.refresh(user)
        db.refresh(user, ["vacation_days"])
        logger.info(f"User updated: {user.email} (ID: {user.id})")
        return user
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update user: {str(e)}",
        )


@app.delete("/users/{user_id}", response_model=dict, tags=["users"])
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Delete a user and all associated data. Requires admin privileges."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    try:
        # Delete related records (cascading)
        db.query(models.UserDayStatus).filter(
            models.UserDayStatus.user_id == user_id
        ).delete(synchronize_session=False)
        
        db.query(models.AnnualRemoteCounter).filter(
            models.AnnualRemoteCounter.user_id == user_id
        ).delete(synchronize_session=False)
        
        db.query(models.UserVacationDays).filter(
            models.UserVacationDays.user_id == user_id
        ).delete(synchronize_session=False)

        db.delete(user)
        db.commit()
        logger.info(f"User deleted: {user.email} (ID: {user.id})")
        return {"status": "success", "message": f"User {user_id} deleted"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting user {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}",
        )


# Calendar month endpoints
@app.get(
    "/months/{year}/{month}",
    response_model=schemas.CalendarMonthOut,
    tags=["calendar"],
)
def get_month(year: int, month: int, db: Session = Depends(get_db)):
    """Get or create a calendar month with all its days."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    return crud.get_or_create_month(db, year, month)


@app.post(
    "/months/{year}/{month}/lock",
    response_model=schemas.CalendarMonthOut,
    tags=["calendar"],
)
def lock_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Lock a calendar month to prevent further edits. Requires admin privileges."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    
    month_obj = crud.get_or_create_month(db, year, month)
    month_obj.is_locked = True
    db.add(month_obj)
    db.commit()
    db.refresh(month_obj)
    logger.info(f"Month locked: {year}-{month:02d}")
    return month_obj


@app.post(
    "/months/{year}/{month}/unlock",
    response_model=schemas.CalendarMonthOut,
    tags=["calendar"],
)
def unlock_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Unlock a calendar month to allow edits. Requires admin privileges."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    
    month_obj = crud.get_or_create_month(db, year, month)
    month_obj.is_locked = False
    db.add(month_obj)
    db.commit()
    db.refresh(month_obj)
    logger.info(f"Month unlocked: {year}-{month:02d}")
    return month_obj


# User calendar endpoints
@app.get(
    "/users/{user_id}/calendar/{year}/{month}",
    response_model=schemas.UserCalendarOut,
    tags=["calendar"],
)
def get_user_calendar(
    user_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a user's calendar for a specific month."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    
    # Authorization check
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own calendar",
        )

    month_obj = crud.get_or_create_month(db, year, month)
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    statuses = crud.get_statuses_for_user_month(db, user_id, month_obj)
    items = [
        schemas.UserDayStatusOut(date=day, status=status)
        for day, status in statuses.items()
    ]
    return schemas.UserCalendarOut(user=user, month=month_obj, items=items)


@app.put(
    "/users/{user_id}/calendar/{year}/{month}",
    response_model=schemas.UserCalendarOut,
    tags=["calendar"],
)
def update_user_calendar(
    user_id: int,
    year: int,
    month: int,
    payload: schemas.UserCalendarUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a user's calendar for a specific month."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    
    # Authorization check
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own calendar",
        )
    
    month_obj = crud.get_or_create_month(db, year, month)
    if month_obj.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot update calendar: month is locked",
        )

    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    try:
        # Delete all existing entries for this user and month first
        crud.delete_user_month_statuses(db, user_id, month_obj)

        # Then add the new ones
        day_by_date = {day.date: day for day in month_obj.days}
        for item in payload.items:
            day = day_by_date.get(item.date)
            if not day:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid date: {item.date} is not in {year}-{month:02d}",
                )
            crud.upsert_user_day_status(db, user_id, day, item.status)

        db.commit()
        logger.info(f"Calendar updated for user {user_id}, month {year}-{month:02d}")
        
        statuses = crud.get_statuses_for_user_month(db, user_id, month_obj)
        items = [
            schemas.UserDayStatusOut(date=day, status=status)
            for day, status in statuses.items()
        ]
        return schemas.UserCalendarOut(user=user, month=month_obj, items=items)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating calendar: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update calendar: {str(e)}",
        )


@app.get(
    "/calendar/{year}/{month}",
    response_model=schemas.TeamCalendarOut,
    tags=["calendar"],
)
def get_team_calendar(year: int, month: int, db: Session = Depends(get_db)):
    """Get team calendar view with all users' statuses for a month."""
    if not (1 <= month <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be between 1 and 12",
        )
    
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
        used_total_year = crud.count_remote_days(db, user.id, year)
        limit = user.annual_remote_limit or 100
        remaining_start = limit - used_before_month
        remaining_end = limit - used_total_year
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


@app.put(
    "/months/{year}/{month}/days/{day_date}/workday",
    response_model=schemas.CalendarDayOut,
    tags=["calendar"],
)
def set_workday_override(
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Override workday status for a specific day. Requires admin privileges."""
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Day {day_date} not found in month {year}-{month:02d}",
        )

    is_workday_override = bool(payload.get("is_workday_override"))
    day.is_workday_override = is_workday_override
    db.add(day)
    db.commit()
    db.refresh(day)
    logger.info(f"Workday override set for {day_date}: {is_workday_override}")
    return day


@app.put(
    "/months/{year}/{month}/days/{day_date}/holiday",
    response_model=schemas.CalendarDayOut,
    tags=["calendar"],
)
def set_holiday(
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Mark a day as holiday or regular day. Requires admin privileges."""
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Day {day_date} not found in month {year}-{month:02d}",
        )

    is_holiday = bool(payload.get("is_holiday"))
    day.is_holiday = is_holiday
    db.add(day)
    db.commit()
    db.refresh(day)
    logger.info(f"Holiday status set for {day_date}: {is_holiday}")
    return day


@app.put(
    "/users/{user_id}/calendar/{year}/{month}/{day_date}/note",
    response_model=dict,
    tags=["calendar"],
)
def update_day_note(
    user_id: int,
    year: int,
    month: int,
    day_date: date,
    payload: dict,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Update note and status for a specific day. Requires admin privileges."""
    month_obj = crud.get_or_create_month(db, year, month)
    day = next((d for d in month_obj.days if d.date == day_date), None)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Day {day_date} not found in month {year}-{month:02d}",
        )
    
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )
    
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
            logger.info(f"Cleared status for user {user_id} on {day_date}")
        return {"success": True, "note": None, "status": None}
    
    try:
        if not user_day_status:
            # Create new status entry
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
                note=payload.get("note"),
            )
            db.add(user_day_status)
        else:
            # Update existing status
            if status_value:
                try:
                    user_day_status.status = models.DayStatus(status_value)
                except ValueError:
                    logger.warning(f"Invalid status value: {status_value}")
            user_day_status.note = payload.get("note")
            db.add(user_day_status)
        
        db.commit()
        db.refresh(user_day_status)
        logger.info(f"Updated note for user {user_id} on {day_date}")
        return {
            "success": True,
            "note": user_day_status.note,
            "status": user_day_status.status.value,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating note: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update note: {str(e)}",
        )


@app.get(
    "/who-is-in-office",
    response_model=schemas.WhoIsInOfficeOut,
    tags=["reports"],
)
def who_is_in_office(target_date: date, db: Session = Depends(get_db)):
    """Get a breakdown of users by their status for a specific date."""
    month_obj = crud.get_or_create_month(db, target_date.year, target_date.month)
    day = next((d for d in month_obj.days if d.date == target_date), None)
    if not day:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Day {target_date} not found",
        )

    users = db.query(models.User).all()
    by_status: dict[models.DayStatus, list[models.User]] = {
        status: [] for status in models.DayStatus
    }

    statuses = db.query(models.UserDayStatus).filter(
        models.UserDayStatus.day_id == day.id
    ).all()
    status_map = {s.user_id: s.status for s in statuses}

    for user in users:
        status_value = status_map.get(user.id, models.DayStatus.office)
        by_status[status_value].append(user)

    return schemas.WhoIsInOfficeOut(date=target_date, by_status=by_status)


@app.get(
    "/me/remote-counter",
    response_model=schemas.RemoteCounterOut,
    tags=["reports"],
)
def get_remote_counter(
    year: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get remote work counter for the current user."""
    used = crud.count_remote_days(db, current_user.id, year)
    remaining = current_user.annual_remote_limit - used
    return schemas.RemoteCounterOut(
        year=year,
        used=used,
        limit=current_user.annual_remote_limit,
        remaining=remaining,
    )


@app.get(
    "/me/vacation-counter",
    response_model=schemas.VacationCounterOut,
    tags=["reports"],
)
def get_vacation_counter(
    year: int,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get vacation counter for the current user."""
    from . import utils
    
    # Calculate accrued vacation days
    accrued = utils.calculate_vacation_days_accrued(
        current_user.start_date,
        year,
        12,
    )
    
    # Add additional and carryover vacation days
    accrued += current_user.additional_vacation_days
    accrued += current_user.carryover_vacation_days
    
    # Calculate used vacation days
    used = crud.count_vacation_days(db, current_user.id, year)
    remaining = max(accrued - used, 0)
    
    return schemas.VacationCounterOut(
        year=year,
        allowed=accrued,
        used=used,
        remaining=remaining,
    )


@app.get(
    "/users/{user_id}/vacation-dates",
    response_model=list[date],
    tags=["reports"],
)
def get_user_vacation_dates(
    user_id: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all vacation dates for a specific user in a year."""
    # Authorization check
    if current_user.role != models.Role.admin and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own vacation dates",
        )

    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found",
        )

    return crud.get_vacation_dates(db, user_id, year)
