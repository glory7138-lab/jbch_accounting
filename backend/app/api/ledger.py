from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Account, Fund, Voucher

router = APIRouter(prefix="/ledger", tags=["ledger"])

LEDGER_CATEGORIES = [
    {"slug": "integrated", "name": "통합계정"},
    {"slug": "general", "name": "일반계정"},
    {"slug": "school-support", "name": "교회학교후원회비"},
    {"slug": "love-offering", "name": "사랑의헌금"},
    {"slug": "mission-fee", "name": "선교회비"},
    {"slug": "building", "name": "건축계정"},
    {"slug": "elevator", "name": "승강기계정"},
    {"slug": "overseas", "name": "해외후원"},
    {"slug": "domestic-mission", "name": "국내선교"},
]


class LedgerEntryPayload(BaseModel):
    voucher_date: date
    entry_type: str
    description: str
    amount: Decimal
    category_name: str
    account_id: int | None = None
    counterparty: str | None = None
    note: str | None = None


class AccountCodePayload(BaseModel):
    code: str
    name: str
    major_category: str | None = None
    middle_category: str | None = None
    report_category: str | None = None
    account_type: str | None = None
    finance_category: str | None = None
    debit_account: str | None = None
    credit_account: str | None = None
    normal_side: str | None = None
    is_active: bool = True


def _period_bounds(year: int, month: int | None) -> tuple[date, date]:
    if month:
        return date(year, month, 1), date(year, month, monthrange(year, month)[1])
    return date(year, 1, 1), date(year, 12, 31)


def _ledger_categories_by_slug() -> dict[str, str]:
    return {item["slug"]: item["name"] for item in LEDGER_CATEGORIES}


def _ensure_fund(db: Session, fund_name: str) -> Fund:
    existing = db.scalar(select(Fund).where(Fund.name == fund_name))
    if existing:
        return existing
    fund = Fund(code=fund_name.replace(' ', '-'), name=fund_name, is_active=True)
    db.add(fund)
    db.flush()
    return fund


def _entry_to_dict(voucher: Voucher) -> dict:
    return {
        "id": voucher.id,
        "voucher_no": voucher.voucher_no,
        "voucher_date": voucher.voucher_date.isoformat(),
        "entry_type": voucher.entry_type,
        "description": voucher.description,
        "amount": float(voucher.amount or 0),
        "category_name": voucher.fund.name if voucher.fund else (voucher.fund_name or ""),
        "account_id": voucher.account_id,
        "account_code": voucher.account.code if voucher.account else None,
        "account_name": voucher.account.name if voucher.account else None,
        "counterparty": voucher.counterparty,
        "note": voucher.note,
    }


def _build_voucher_no(prefix: str = "L") -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def _statement_for_entries(category_name: str, start_date: date, end_date: date):
    return (
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            or_(Voucher.fund_name == category_name, Voucher.fund.has(Fund.name == category_name), Voucher.source_sheet == category_name),
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    )


def _account_rows_frame(accounts: list[Account]) -> pd.DataFrame:
    rows = []
    for account in accounts:
        rows.append(
            {
                "회계코드": account.code,
                "계정명": account.name,
                "대분류관리항목": account.major_category or "",
                "중분류관리항목": account.middle_category or "",
                "세부관리항목(보고용)": account.report_category or "",
                "계정유형": account.account_type or "",
                "재무분류": account.finance_category or "",
                "차변계정": account.debit_account or "",
                "대변계정": account.credit_account or "",
                "기본방향": account.normal_side or "",
                "사용여부": "Y" if account.is_active else "N",
            }
        )
    return pd.DataFrame(rows)


@router.get("/categories")
def get_categories():
    return LEDGER_CATEGORIES


@router.get("/entries")
def list_entries(category: str = Query(...), year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    start_date, end_date = _period_bounds(year, month)
    vouchers = db.scalars(_statement_for_entries(category, start_date, end_date)).unique().all()
    return {
        "category": category,
        "year": year,
        "month": month,
        "rows": [_entry_to_dict(voucher) for voucher in vouchers],
        "total_amount": float(sum((Decimal(voucher.amount or 0) for voucher in vouchers), Decimal('0'))),
    }


@router.get("/entries.xlsx")
def export_entries(category: str = Query(...), year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    result = list_entries(category=category, year=year, month=month, db=db)
    df = pd.DataFrame(result["rows"])
    if not df.empty:
        df = df[["voucher_date", "voucher_no", "entry_type", "account_code", "account_name", "description", "amount", "counterparty", "note"]]
        df.columns = ["일자", "전표번호", "유형", "계정코드", "계정명", "적요", "금액", "거래처", "비고"]
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=category[:31])
    buffer.seek(0)
    suffix = f"{year}-{month:02d}" if month else str(year)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="ledger-{category}-{suffix}.xlsx"'},
    )


@router.post("/entries")
def create_entry(payload: LedgerEntryPayload, db: Session = Depends(get_db)):
    fund = _ensure_fund(db, payload.category_name)
    voucher = Voucher(
        voucher_no=_build_voucher_no(),
        voucher_date=payload.voucher_date,
        entry_type=payload.entry_type,
        description=payload.description,
        amount=payload.amount,
        fund_id=fund.id,
        fund_name=fund.name,
        account_id=payload.account_id,
        counterparty=payload.counterparty,
        note=payload.note,
        source_workbook="ledger_ui",
        source_sheet=payload.category_name,
    )
    db.add(voucher)
    db.commit()
    db.refresh(voucher)
    return _entry_to_dict(db.scalar(select(Voucher).options(joinedload(Voucher.account), joinedload(Voucher.fund)).where(Voucher.id == voucher.id)))


@router.put("/entries/{voucher_id}")
def update_entry(voucher_id: int, payload: LedgerEntryPayload, db: Session = Depends(get_db)):
    voucher = db.get(Voucher, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="전표를 찾지 못했습니다.")
    fund = _ensure_fund(db, payload.category_name)
    voucher.voucher_date = payload.voucher_date
    voucher.entry_type = payload.entry_type
    voucher.description = payload.description
    voucher.amount = payload.amount
    voucher.fund_id = fund.id
    voucher.fund_name = fund.name
    voucher.account_id = payload.account_id
    voucher.counterparty = payload.counterparty
    voucher.note = payload.note
    voucher.source_workbook = "ledger_ui"
    voucher.source_sheet = payload.category_name
    db.commit()
    return _entry_to_dict(db.scalar(select(Voucher).options(joinedload(Voucher.account), joinedload(Voucher.fund)).where(Voucher.id == voucher.id)))


@router.get("/account-codes")
def list_account_codes(query: str | None = Query(default=None), db: Session = Depends(get_db)):
    statement = select(Account).order_by(Account.code.asc())
    keyword = (query or "").strip()
    if keyword:
        statement = statement.where(
            or_(
                Account.code.contains(keyword),
                Account.name.contains(keyword),
                Account.major_category.contains(keyword),
                Account.middle_category.contains(keyword),
                Account.report_category.contains(keyword),
            )
        )
    accounts = db.scalars(statement.limit(1000)).all()
    return [
        {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "major_category": account.major_category,
            "middle_category": account.middle_category,
            "report_category": account.report_category,
            "account_type": account.account_type,
            "finance_category": account.finance_category,
            "debit_account": account.debit_account,
            "credit_account": account.credit_account,
            "normal_side": account.normal_side,
            "is_active": account.is_active,
        }
        for account in accounts
    ]


@router.get("/account-codes.xlsx")
def export_account_codes(query: str | None = Query(default=None), db: Session = Depends(get_db)):
    rows = list_account_codes(query=query, db=db)
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df[["code", "name", "major_category", "middle_category", "report_category", "account_type", "finance_category", "debit_account", "credit_account", "normal_side", "is_active"]]
        df.columns = ["회계코드", "계정명", "대분류관리항목", "중분류관리항목", "세부관리항목(보고용)", "계정유형", "재무분류", "차변계정", "대변계정", "기본방향", "사용여부"]
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="계정코드")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="account-codes.xlsx"'},
    )


@router.post("/account-codes")
def create_account_code(payload: AccountCodePayload, db: Session = Depends(get_db)):
    exists = db.scalar(select(Account).where(Account.code == payload.code))
    if exists:
        raise HTTPException(status_code=400, detail="이미 존재하는 회계코드입니다.")
    account = Account(**payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"id": account.id, **payload.model_dump()}


@router.put("/account-codes/{account_id}")
def update_account_code(account_id: int, payload: AccountCodePayload, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="회계코드를 찾지 못했습니다.")
    conflict = db.scalar(select(Account).where(and_(Account.code == payload.code, Account.id != account_id)))
    if conflict:
        raise HTTPException(status_code=400, detail="이미 존재하는 회계코드입니다.")
    for key, value in payload.model_dump().items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    return {"id": account.id, **payload.model_dump()}


@router.post("/account-codes/upload")
async def upload_account_codes(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"엑셀 읽기 실패: {exc}") from exc

    def col(name_options: list[str]) -> str | None:
        for column in df.columns:
            text = str(column).strip()
            if any(option in text for option in name_options):
                return column
        return None

    code_col = col(["회계코드", "코드"])
    name_col = col(["계정명", "세부관리항목", "보고용"])
    major_col = col(["대분류관리항목"])
    middle_col = col(["중분류관리항목"])
    report_col = col(["세부관리항목", "보고용"])
    debit_col = col(["차변계정"])
    credit_col = col(["대변계정"])

    if not code_col or not name_col:
        raise HTTPException(status_code=400, detail="회계코드/계정명 컬럼을 찾지 못했습니다.")

    created = 0
    updated = 0
    for _, row in df.iterrows():
        code = str(row.get(code_col, "")).strip()
        name = str(row.get(name_col, "")).strip()
        if not code or code.lower() == "nan" or not name or name.lower() == "nan":
            continue
        account = db.scalar(select(Account).where(Account.code == code))
        payload = {
            "name": name,
            "major_category": str(row.get(major_col, "")).strip() or None if major_col else None,
            "middle_category": str(row.get(middle_col, "")).strip() or None if middle_col else None,
            "report_category": str(row.get(report_col, "")).strip() or None if report_col else None,
            "debit_account": str(row.get(debit_col, "")).strip() or None if debit_col else None,
            "credit_account": str(row.get(credit_col, "")).strip() or None if credit_col else None,
        }
        payload = {key: (None if value in {"", "nan", "None"} else value) for key, value in payload.items()}
        if account:
            for key, value in payload.items():
                setattr(account, key, value)
            updated += 1
        else:
            db.add(Account(code=code, is_active=True, **payload))
            created += 1
    db.commit()
    return {"created": created, "updated": updated}
