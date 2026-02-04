from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import create_engine, event, pool
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./officecal.db")

# Configure engine with appropriate settings
engine_kwargs = {
    "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
    "pool_pre_ping": True,  # Verify connections before using
}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine_kwargs["poolclass"] = pool.StaticPool  # Better for SQLite
else:
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
