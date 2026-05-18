from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Fund, Member
from app.schemas import AccountRead, FundRead, MemberRead

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    return db.scalars(select(Account).where(Account.is_active == True).order_by(Account.code.asc())).all()


@router.get("/funds", response_model=list[FundRead])
def list_funds(db: Session = Depends(get_db)):
    return db.scalars(select(Fund).where(Fund.is_active == True).order_by(Fund.name.asc())).all()


@router.get("/members", response_model=list[MemberRead])
def list_members(db: Session = Depends(get_db)):
    return db.scalars(select(Member).order_by(Member.name.asc()).limit(500)).all()
