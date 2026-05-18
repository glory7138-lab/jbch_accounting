from sqlalchemy import inspect
from sqlalchemy.orm import Session

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


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_column("accounts", "account_type", "VARCHAR(100)")
    _ensure_column("accounts", "finance_category", "VARCHAR(100)")
    _ensure_column("vouchers", "fund_name", "VARCHAR(255)")


def bootstrap_reference_data(db: Session) -> dict:
    settings = get_settings()
    return seed_reference_data(db, settings.sample_data_dir)
