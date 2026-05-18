from datetime import datetime
from decimal import Decimal
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Account, Fund, Member, Voucher, VoucherLine
from app.schemas import VoucherCreate, VoucherRead, VoucherUpdate, WeeklyOfferingCreate, WeeklyOfferingResponse

router = APIRouter(prefix="/vouchers", tags=["vouchers"])

WEEKLY_OFFERING_CODES = {
    "11000",
    "11200",
    "13000",
    "11400",
    "11100",
    "11500",
    "11300",
    "12000",
    "12200",
    "14000",
    "12100",
    "23000",
    "25030",
}


def _voucher_statement():
    return (
        select(Voucher)
        .options(
            joinedload(Voucher.account),
            joinedload(Voucher.fund),
            joinedload(Voucher.member),
            joinedload(Voucher.lines).joinedload(VoucherLine.account),
            joinedload(Voucher.lines).joinedload(VoucherLine.fund),
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    )


def _slugify(text: str) -> str:
    value = re.sub(r"[^0-9A-Za-z가-힣]+", "-", text).strip("-").lower()
    return value or f"fund-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"


def _build_voucher_no(prefix: str = "V", suffix: str | None = None) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    return f"{prefix}-{stamp}-{suffix}" if suffix else f"{prefix}-{stamp}"


def _resolve_fund(db: Session, fund_id: int | None, fund_name: str | None) -> tuple[int | None, str | None]:
    if fund_id:
        fund = db.get(Fund, fund_id)
        if not fund:
            raise HTTPException(status_code=400, detail="선택한 회계/기금이 존재하지 않습니다.")
        return fund.id, fund.name

    normalized_name = (fund_name or "").strip()
    if not normalized_name:
        return None, None

    existing = db.scalar(select(Fund).where(Fund.name == normalized_name))
    if existing:
        return existing.id, existing.name

    candidate_code = _slugify(normalized_name)
    suffix = 1
    while db.scalar(select(Fund).where(Fund.code == candidate_code)):
        suffix += 1
        candidate_code = f"{_slugify(normalized_name)}-{suffix}"

    fund = Fund(code=candidate_code, name=normalized_name)
    db.add(fund)
    db.flush()
    return fund.id, fund.name


def _account_display(account: Account) -> str:
    return account.report_category or account.name or account.code


def _compose_weekly_note(payload: WeeklyOfferingCreate) -> str | None:
    parts = []
    if payload.envelope_no:
        parts.append(f"봉투번호 {payload.envelope_no}")
    if payload.department_name:
        parts.append(f"회별 {payload.department_name}")
    if payload.district_name:
        parts.append(f"구역 {payload.district_name}")
    if payload.is_transfer:
        parts.append("이체헌금")
    if payload.note:
        parts.append(payload.note.strip())
    return " | ".join(part for part in parts if part).strip() or None


@router.get("", response_model=list[VoucherRead])
def list_vouchers(limit: int = Query(default=200, le=1000), db: Session = Depends(get_db)):
    return db.scalars(_voucher_statement().limit(limit)).unique().all()


@router.get("/{voucher_id}", response_model=VoucherRead)
def get_voucher(voucher_id: int, db: Session = Depends(get_db)):
    voucher = db.scalars(_voucher_statement().where(Voucher.id == voucher_id)).unique().first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return voucher


@router.post("", response_model=VoucherRead)
def create_voucher(payload: VoucherCreate, db: Session = Depends(get_db)):
    resolved_fund_id, resolved_fund_name = _resolve_fund(db, payload.fund_id, payload.fund_name)
    voucher = Voucher(
        voucher_no=_build_voucher_no(),
        voucher_date=payload.voucher_date,
        entry_type=payload.entry_type,
        description=payload.description,
        amount=Decimal(payload.amount),
        fund_id=resolved_fund_id,
        fund_name=resolved_fund_name,
        account_id=payload.account_id,
        member_id=payload.member_id,
        counterparty=payload.counterparty,
        note=payload.note,
        source_workbook=payload.source_workbook,
        source_sheet=payload.source_sheet,
    )
    for index, line in enumerate(payload.lines, start=1):
        voucher.lines.append(
            VoucherLine(
                line_no=index,
                account_id=line.account_id,
                fund_id=line.fund_id,
                debit=Decimal(line.debit),
                credit=Decimal(line.credit),
                description=line.description,
                note=line.note,
            )
        )
    db.add(voucher)
    db.commit()
    return db.scalars(_voucher_statement().where(Voucher.id == voucher.id)).unique().first()


@router.post("/weekly-offering", response_model=WeeklyOfferingResponse)
def create_weekly_offering(payload: WeeklyOfferingCreate, db: Session = Depends(get_db)):
    member = db.get(Member, payload.member_id) if payload.member_id else None
    counterparty = (member.name if member else payload.member_name) or None
    note = _compose_weekly_note(payload)

    created: list[Voucher] = []
    total_amount = Decimal("0")
    cash_total = Decimal("0")

    for code, raw_amount in payload.offerings.items():
        amount = Decimal(raw_amount)
        if code not in WEEKLY_OFFERING_CODES or amount <= 0:
            continue

        account = db.scalar(select(Account).where(Account.code == code))
        if not account:
            raise HTTPException(status_code=400, detail=f"계정코드 {code}를 찾지 못했습니다.")

        description = _account_display(account)
        resolved_fund_id, resolved_fund_name = _resolve_fund(db, None, description)
        voucher = Voucher(
            voucher_no=_build_voucher_no(prefix="W", suffix=code),
            voucher_date=payload.voucher_date,
            entry_type="income",
            description=description,
            amount=amount,
            fund_id=resolved_fund_id,
            fund_name=resolved_fund_name,
            account_id=account.id,
            member_id=member.id if member else payload.member_id,
            counterparty=counterparty,
            note=note,
            source_workbook="weekly_offering_ui",
            source_sheet="weekly_offering_entry",
        )
        db.add(voucher)
        created.append(voucher)
        total_amount += amount
        if not payload.is_transfer:
            cash_total += amount

    if not created:
        raise HTTPException(status_code=400, detail="등록할 헌금 금액이 없습니다.")

    db.commit()
    return WeeklyOfferingResponse(
        created_count=len(created),
        total_amount=total_amount,
        cash_total=cash_total,
        voucher_ids=[voucher.id for voucher in created],
        voucher_nos=[voucher.voucher_no for voucher in created],
    )


@router.put("/{voucher_id}", response_model=VoucherRead)
def update_voucher(voucher_id: int, payload: VoucherUpdate, db: Session = Depends(get_db)):
    voucher = db.get(Voucher, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    update_data = payload.model_dump(exclude_unset=True)

    if "fund_id" in update_data or "fund_name" in update_data:
        resolved_fund_id, resolved_fund_name = _resolve_fund(
            db,
            update_data.get("fund_id", voucher.fund_id),
            update_data.get("fund_name", voucher.fund_name),
        )
        voucher.fund_id = resolved_fund_id
        voucher.fund_name = resolved_fund_name
        update_data.pop("fund_id", None)
        update_data.pop("fund_name", None)

    for key, value in update_data.items():
        setattr(voucher, key, value)
    db.commit()
    return db.scalars(_voucher_statement().where(Voucher.id == voucher.id)).unique().first()


@router.delete("/{voucher_id}")
def delete_voucher(voucher_id: int, db: Session = Depends(get_db)):
    voucher = db.get(Voucher, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    db.delete(voucher)
    db.commit()
    return {"ok": True}
