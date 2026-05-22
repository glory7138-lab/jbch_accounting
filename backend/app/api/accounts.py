from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Fund, Member
from app.schemas import AccountRead, FundRead, MemberLookupResponse, MemberRead

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountRead])
def list_accounts(db: Session = Depends(get_db)):
    return db.scalars(select(Account).where(Account.is_active == True).order_by(Account.code.asc())).all()


@router.get("/funds", response_model=list[FundRead])
def list_funds(db: Session = Depends(get_db)):
    return db.scalars(select(Fund).where(Fund.is_active == True).order_by(Fund.name.asc())).all()


@router.get("/members", response_model=list[MemberRead])
def list_members(year: int | None = Query(default=None), db: Session = Depends(get_db)):
    if year is None:
        year = date.today().year
    return db.scalars(select(Member).where(Member.year == year).order_by(Member.name.asc()).limit(500)).all()


@router.get("/member-search", response_model=list[MemberRead])
def search_members(query: str = Query(..., min_length=1), year: int | None = Query(default=None), db: Session = Depends(get_db)):
    if year is None:
        year = date.today().year
    keyword = query.strip()
    statement = (
        select(Member)
        .where(
            Member.year == year,
            or_(
                Member.member_no.contains(keyword),
                Member.name.contains(keyword),
                Member.department_name.contains(keyword),
                Member.district_name.contains(keyword),
                Member.gender_or_section.contains(keyword),
                Member.age_or_class.contains(keyword),
            )
        )
        .order_by(Member.name.asc(), Member.member_no.asc())
        .limit(20)
    )
    return db.scalars(statement).all()


@router.get("/member-lookup", response_model=MemberLookupResponse)
def lookup_member(memberKey: str = Query(..., min_length=1), year: int | None = Query(default=None), db: Session = Depends(get_db)):
    if year is None:
        year = date.today().year
    key = memberKey.strip()
    member = db.scalar(select(Member).where(Member.year == year, Member.member_no == key))
    if member:
        return MemberLookupResponse(found=True, lookup_key=key, found_by="member_no", member=member)

    member = db.scalar(select(Member).where(Member.year == year, Member.name == key))
    if member:
        return MemberLookupResponse(found=True, lookup_key=key, found_by="exact_name", member=member)

    member = db.scalar(
        select(Member)
        .where(
            Member.year == year,
            or_(
                Member.name.contains(key),
                Member.department_name.contains(key),
                Member.district_name.contains(key),
                Member.gender_or_section.contains(key),
                Member.age_or_class.contains(key),
            )
        )
        .order_by(Member.name.asc())
    )
    if member:
        return MemberLookupResponse(
            found=True,
            lookup_key=key,
            found_by="partial_match",
            member=member,
            message="정확 일치가 없어 가장 가까운 항목을 보여줍니다.",
        )

    return MemberLookupResponse(
        found=False,
        lookup_key=key,
        message="일치하는 헌금자 정보가 없습니다. 헌금 봉투 번호(또는 등록 번호)를 먼저 확인하거나 이름 일부로 검색해 주세요.",
    )
