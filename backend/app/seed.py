from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, engine
from app.models import Account, Fund
from app.services.excel_analysis import seed_reference_data


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def bootstrap_reference_data(db: Session) -> dict:
    settings = get_settings()
    account_count = db.scalar(select(func.count(Account.id))) or 0
    fund_count = db.scalar(select(func.count(Fund.id))) or 0
    if account_count > 0 or fund_count > 0:
        return {"import_batches": 0, "funds": 0, "accounts": 0, "members": 0}
    return seed_reference_data(db, settings.sample_data_dir)
