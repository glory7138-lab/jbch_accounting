from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
import uuid

from app.config import get_settings
from app.database import Base, engine
from app.services.excel_analysis import seed_reference_data


def _ensure_column(table_name: str, column_name: str, ddl: str) -> None:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in columns:
        return
    with engine.begin() as connection:
        connection.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")


def _migrate_existing_data(db: Session) -> None:
    # sqlite_sequence 등 시스템 테이블을 제외하고 members 테이블이 존재하는지 먼저 확인
    inspector = inspect(engine)
    if "members" not in inspector.get_table_names():
        return
        
    try:
        db.execute(text("UPDATE members SET year = 2026 WHERE year IS NULL"))
        db.commit()
    except Exception:
        db.rollback()

    try:
        null_members = db.execute(text("SELECT id, name FROM members WHERE person_id IS NULL")).all()
        if null_members:
            existing_map = {}
            rows = db.execute(text("SELECT name, person_id FROM members WHERE person_id IS NOT NULL")).all()
            for r in rows:
                existing_map[r[0]] = r[1]

            for mid, name in null_members:
                if name in existing_map:
                    pid = existing_map[name]
                else:
                    pid = f"P-{uuid.uuid4().hex[:8].upper()}"
                    existing_map[name] = pid
                db.execute(text("UPDATE members SET person_id = :pid WHERE id = :mid"), {"pid": pid, "mid": mid})
            db.commit()
    except Exception:
        db.rollback()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_column("accounts", "account_type", "VARCHAR(100)")
    _ensure_column("accounts", "finance_category", "VARCHAR(100)")
    _ensure_column("members", "district_name", "VARCHAR(255)")
    _ensure_column("members", "person_id", "VARCHAR(50)")
    _ensure_column("members", "year", "INTEGER")
    _ensure_column("members", "salvation_date", "VARCHAR(50)")
    _ensure_column("vouchers", "fund_name", "VARCHAR(255)")


def bootstrap_reference_data(db: Session) -> dict:
    _migrate_existing_data(db)
    settings = get_settings()
    return seed_reference_data(db, settings.sample_data_dir)
