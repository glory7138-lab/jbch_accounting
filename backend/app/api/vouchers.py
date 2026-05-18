from datetime import datetime
from decimal import Decimal
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Fund, Voucher, VoucherLine
from app.schemas import VoucherCreate, VoucherRead, VoucherUpdate

router = APIRouter(prefix="/vouchers", tags=["vouchers"])


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
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    resolved_fund_id, resolved_fund_name = _resolve_fund(db, payload.fund_id, payload.fund_name)
    voucher = Voucher(
        voucher_no=f"V-{timestamp}",
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
