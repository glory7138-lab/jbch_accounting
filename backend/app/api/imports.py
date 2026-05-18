from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas import AnalysisSummary
from app.services.excel_analysis import analyze_sample_directory
from app.seed import bootstrap_reference_data

router = APIRouter(prefix="/imports", tags=["imports"])


@router.get("/sample-analysis", response_model=AnalysisSummary)
def sample_analysis():
    settings = get_settings()
    return analyze_sample_directory(settings.sample_data_dir)


@router.post("/bootstrap")
def bootstrap_samples(db: Session = Depends(get_db)):
    return bootstrap_reference_data(db)
