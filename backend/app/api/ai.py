from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AiSuggestionRequest, AiSuggestionResponse
from app.services.ai_classifier import suggest_account

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/suggest-account", response_model=AiSuggestionResponse)
def recommend_account(payload: AiSuggestionRequest, db: Session = Depends(get_db)):
    return suggest_account(db, description=payload.description, amount=payload.amount, model=payload.model)
