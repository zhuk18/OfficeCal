from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, pool
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session

# Load environment variables from .env file
load_dotenv()

# Database URL - supports SQLite, PostgreSQL, and MySQL
# For Supabase (PostgreSQL): postgresql://user:password@host:5432/database
# For SQLite: sqlite:///./officecalendar.db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./officecalendar.db")

# Configure engine with appropriate settings
engine_kwargs = {
    "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
    "pool_pre_ping": True,  # Verify connections before using
}

is_mysql = "mysql" in DATABASE_URL.lower()
is_postgresql = "postgresql" in DATABASE_URL.lower() or "postgres" in DATABASE_URL.lower()

if DATABASE_URL.startswith("sqlite"):
    # SQLite configuration
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine_kwargs["poolclass"] = pool.StaticPool  # Better for SQLite
elif is_postgresql:
    # PostgreSQL/Supabase configuration
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "5"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    engine_kwargs["pool_timeout"] = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    engine_kwargs["pool_recycle"] = int(os.getenv("DB_POOL_RECYCLE", "3600"))
elif is_mysql:
    # MySQL/Aurora configuration
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "5"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    engine_kwargs["pool_timeout"] = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    engine_kwargs["pool_recycle"] = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    # MySQL specific settings
    engine_kwargs["connect_args"] = {
        "charset": "utf8mb4",
        "connect_timeout": 30,
    }
else:
    # Other database defaults
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "5"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    engine_kwargs["pool_timeout"] = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    engine_kwargs["pool_recycle"] = int(os.getenv("DB_POOL_RECYCLE", "3600"))

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Enable foreign keys for SQLite
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# For PostgreSQL/Supabase, no special event listeners needed as it handles everything well

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


def get_db() -> AsyncGenerator[Session, None]:
    """Dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
