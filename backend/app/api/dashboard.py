from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import DashboardSummary, OfferingDashboardSummary
from app.services.dashboard_service import build_dashboard_summary, build_offerings_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(year: int | None = None, db: Session = Depends(get_db)):
    return build_dashboard_summary(db, year)


@router.get("/offerings", response_model=OfferingDashboardSummary)
def offerings_dashboard(
    start_ym: str | None = None,
    end_ym: str | None = None,
    department: str | None = None,
    account_id: int | None = None,
    db: Session = Depends(get_db),
):
    return build_offerings_dashboard(db, start_ym, end_ym, department, account_id)

