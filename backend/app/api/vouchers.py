from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Voucher, VoucherLine
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
    voucher = Voucher(
        voucher_no=f"V-{timestamp}",
        voucher_date=payload.voucher_date,
        entry_type=payload.entry_type,
        description=payload.description,
        amount=Decimal(payload.amount),
        fund_id=payload.fund_id,
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
