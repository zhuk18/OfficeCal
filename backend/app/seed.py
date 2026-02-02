from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app import models


def seed():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        # Always ensure all departments exist
        department_names = [
            "Accounting and law",
            "Cloud",
            "Development",
            "HR",
            "Integrations",
            "Marketing",
            "Office administrators",
            "Partner relationships",
            "Product owners",
            "Sales",
            "Security",
            "Support",
            "System administration",
            "Trainings",
        ]
        
        dept_objs = []
        for dept_name in department_names:
            existing_dept = db.query(models.Department).filter_by(name=dept_name).first()
            if existing_dept:
                dept_objs.append(existing_dept)
            else:
                dept = models.Department(name=dept_name)
                db.add(dept)
                dept_objs.append(dept)
        
        db.flush()
        
        # Only create demo users if none exist
        if db.query(models.User).count() > 0:
            db.commit()
            return

        # Get HR and Development departments for demo users
        hr_dept = next((d for d in dept_objs if d.name == "HR"), dept_objs[0])
        dev_dept = next((d for d in dept_objs if d.name == "Development"), dept_objs[0])

        admin = models.User(
            display_name="Admin User",
            email="admin@example.com",
            role=models.Role.admin,
            annual_remote_limit=100,
            department_id=hr_dept.id,
        )
        alice = models.User(
            display_name="Alice Employee",
            email="alice@example.com",
            role=models.Role.employee,
            annual_remote_limit=100,
            department_id=dev_dept.id,
        )
        bob = models.User(
            display_name="Bob Manager",
            email="bob@example.com",
            role=models.Role.manager,
            annual_remote_limit=100,
            department_id=dev_dept.id,
        )
        db.add_all([admin, alice, bob])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
