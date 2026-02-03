#!/usr/bin/env python
"""Migration script to add new columns to existing database."""

import os
from sqlalchemy import text, inspect
from backend.app.database import engine, Base, SessionLocal
from backend.app import models

def migrate_database():
    """Add missing columns to existing tables."""
    
    with engine.connect() as connection:
        inspector = inspect(engine)
        
        # Check if User table exists
        if 'users' in inspector.get_table_names():
            user_columns = [col['name'] for col in inspector.get_columns('users')]
            
            # Add start_date column if missing
            if 'start_date' not in user_columns:
                print("Adding start_date column to users table...")
                connection.execute(text("ALTER TABLE users ADD COLUMN start_date DATE NULL"))
                connection.commit()
                print("✓ Added start_date column")
            
            # Add additional_vacation_days column if missing
            if 'additional_vacation_days' not in user_columns:
                print("Adding additional_vacation_days column to users table...")
                connection.execute(text("ALTER TABLE users ADD COLUMN additional_vacation_days INTEGER DEFAULT 0"))
                connection.commit()
                print("✓ Added additional_vacation_days column")
            
            # Add carryover_vacation_days column if missing
            if 'carryover_vacation_days' not in user_columns:
                print("Adding carryover_vacation_days column to users table...")
                connection.execute(text("ALTER TABLE users ADD COLUMN carryover_vacation_days INTEGER DEFAULT 0"))
                connection.commit()
                print("✓ Added carryover_vacation_days column")
        
        # Check if user_day_statuses table exists and add note column if missing
        if 'user_day_statuses' in inspector.get_table_names():
            status_columns = [col['name'] for col in inspector.get_columns('user_day_statuses')]
            
            if 'note' not in status_columns:
                print("Adding note column to user_day_statuses table...")
                connection.execute(text("ALTER TABLE user_day_statuses ADD COLUMN note VARCHAR(500) NULL"))
                connection.commit()
                print("✓ Added note column")

        # Check if calendar_days table exists and add is_workday_override column if missing
        if 'calendar_days' in inspector.get_table_names():
            day_columns = [col['name'] for col in inspector.get_columns('calendar_days')]

            if 'is_workday_override' not in day_columns:
                print("Adding is_workday_override column to calendar_days table...")
                connection.execute(text("ALTER TABLE calendar_days ADD COLUMN is_workday_override BOOLEAN DEFAULT 0"))
                connection.commit()
                print("✓ Added is_workday_override column")
        
        # Create all tables (will skip existing ones)
        Base.metadata.create_all(bind=engine)
        print("✓ Database schema is up to date")

if __name__ == "__main__":
    migrate_database()
    print("\nMigration complete!")
