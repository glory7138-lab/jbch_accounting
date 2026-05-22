from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
import re

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Account, Fund, Member, Voucher, VoucherLine
from app.schemas import (
    VoucherCreate,
    VoucherRead,
    VoucherUpdate,
    WeeklyOfferingBatchCreate,
    WeeklyOfferingCreate,
    WeeklyOfferingResponse,
    WeeklyOfferingSheetResponse,
)

router = APIRouter(prefix="/vouchers", tags=["vouchers"])

WEEKLY_SOURCE_WORKBOOK = "weekly_offering_ui"
WEEKLY_SOURCE_SHEET = "weekly_offering_entry"
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


def _weekly_statement(voucher_date: date):
    return (
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.member))
        .where(
            Voucher.voucher_date == voucher_date,
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
        )
        .order_by(Voucher.member_id.asc(), Voucher.counterparty.asc(), Voucher.id.asc())
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


def _resolve_member_for_year(db: Session, member_id: int | None, target_year: int) -> int | None:
    if not member_id:
        return None
    raw_member = db.get(Member, member_id)
    if not raw_member:
        return None
    if raw_member.year == target_year:
        return raw_member.id

    # 연도가 다른 경우, 해당 성도의 person_id를 바탕으로 전표 연도의 Member를 찾음
    corrected = db.scalar(
        select(Member)
        .where(Member.person_id == raw_member.person_id, Member.year == target_year)
    )
    if corrected:
        return corrected.id

    # 이름 기반으로 전표 연도의 Member가 있는지 확인
    corrected_by_name = db.scalar(
        select(Member)
        .where(Member.name == raw_member.name, Member.year == target_year)
    )
    if corrected_by_name:
        return corrected_by_name.id

    return None



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


def _parse_weekly_note(note: str | None) -> dict:
    parsed = {
        "envelope_no": None,
        "department_name": None,
        "district_name": None,
        "is_transfer": False,
        "note": None,
    }
    if not note:
        return parsed

    extras: list[str] = []
    for token in [item.strip() for item in note.split("|") if item.strip()]:
        if token.startswith("봉투번호 "):
            parsed["envelope_no"] = token.removeprefix("봉투번호 ").strip() or None
        elif token.startswith("회별 "):
            parsed["department_name"] = token.removeprefix("회별 ").strip() or None
        elif token.startswith("구역 "):
            parsed["district_name"] = token.removeprefix("구역 ").strip() or None
        elif token == "이체헌금":
            parsed["is_transfer"] = True
        else:
            extras.append(token)
    parsed["note"] = " | ".join(extras) if extras else None
    return parsed


def _create_weekly_vouchers(payload: WeeklyOfferingCreate, db: Session) -> tuple[list[Voucher], Decimal, Decimal]:
    resolved_member_id = _resolve_member_for_year(db, payload.member_id, payload.voucher_date.year)
    member = db.get(Member, resolved_member_id) if resolved_member_id else None

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
            member_id=resolved_member_id,
            counterparty=counterparty,
            note=note,
            source_workbook=WEEKLY_SOURCE_WORKBOOK,
            source_sheet=WEEKLY_SOURCE_SHEET,
        )
        db.add(voucher)
        created.append(voucher)
        total_amount += amount
        if not payload.is_transfer:
            cash_total += amount

    return created, total_amount, cash_total


def _weekly_group_key(voucher: Voucher) -> str:
    parsed_note = _parse_weekly_note(voucher.note)
    if voucher.member_id:
        return f"member:{voucher.member_id}"
    if parsed_note["envelope_no"]:
        return f"envelope:{parsed_note['envelope_no']}"
    if voucher.counterparty:
        return f"name:{voucher.counterparty}"
    return f"voucher:{voucher.id}"


def _natural_key(value: str | None) -> tuple[int, int | str]:
    text = (value or "").strip()
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _build_weekly_row(vouchers: list[Voucher]) -> dict:
    first = vouchers[0]
    member = first.member
    parsed_note = _parse_weekly_note(first.note)

    offerings: dict[str, Decimal] = {}
    row_total = Decimal("0")
    for voucher in vouchers:
        code = voucher.account.code if voucher.account else None
        if not code or code not in WEEKLY_OFFERING_CODES:
            continue
        amount = Decimal(voucher.amount)
        offerings[code] = offerings.get(code, Decimal("0")) + amount
        row_total += amount

    district_name = parsed_note["district_name"]
    if not district_name and member:
        district_name = member.district_name or member.gender_or_section or member.age_or_class

    return {
        "voucher_date": first.voucher_date,
        "envelope_no": parsed_note["envelope_no"] or (member.member_no if member else None),
        "member_id": member.id if member else first.member_id,
        "member_name": (member.name if member else first.counterparty) or None,
        "department_name": parsed_note["department_name"] or (member.department_name if member else None),
        "district_name": district_name,
        "is_transfer": parsed_note["is_transfer"],
        "note": parsed_note["note"],
        "offerings": offerings,
        "row_total": row_total,
    }


def _load_weekly_sheet(db: Session, voucher_date: date) -> dict:
    vouchers = db.scalars(_weekly_statement(voucher_date)).unique().all()
    grouped: dict[str, list[Voucher]] = defaultdict(list)
    for voucher in vouchers:
        grouped[_weekly_group_key(voucher)].append(voucher)

    rows = [_build_weekly_row(group) for group in grouped.values()]
    rows.sort(key=lambda row: (_natural_key(row.get("envelope_no")), row.get("member_name") or ""))

    total_amount = sum((Decimal(row["row_total"]) for row in rows), Decimal("0"))
    cash_total = sum((Decimal(row["row_total"]) for row in rows if not row.get("is_transfer")), Decimal("0"))
    return {
        "voucher_date": voucher_date,
        "rows": rows,
        "total_amount": total_amount,
        "cash_total": cash_total,
    }


def _sync_weekly_sheet(db: Session, payload: WeeklyOfferingBatchCreate) -> WeeklyOfferingResponse:
    if not payload.rows:
        raise HTTPException(status_code=400, detail="저장할 주간 헌금 행 정보가 없습니다.")

    voucher_dates = {row.voucher_date for row in payload.rows}
    if len(voucher_dates) != 1:
        raise HTTPException(status_code=400, detail="한 번에 하나의 기준 날짜만 저장할 수 있습니다.")

    target_date = voucher_dates.pop()
    db.execute(
        delete(Voucher).where(
            Voucher.voucher_date == target_date,
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
        )
    )
    db.flush()

    all_created: list[Voucher] = []
    total_amount = Decimal("0")
    cash_total = Decimal("0")

    for row in payload.rows:
        created, row_total, row_cash = _create_weekly_vouchers(row, db)
        all_created.extend(created)
        total_amount += row_total
        cash_total += row_cash

    db.commit()
    return WeeklyOfferingResponse(
        created_count=len(all_created),
        total_amount=total_amount,
        cash_total=cash_total,
        voucher_ids=[voucher.id for voucher in all_created],
        voucher_nos=[voucher.voucher_no for voucher in all_created],
    )


@router.get("/weekly-offering", response_model=WeeklyOfferingSheetResponse)
def get_weekly_offering_sheet(voucherDate: date = Query(...), db: Session = Depends(get_db)):
    return _load_weekly_sheet(db, voucherDate)


@router.get("/weekly-offering.xlsx")
def export_weekly_offering_sheet(voucherDate: date = Query(...), db: Session = Depends(get_db)):
    sheet = _load_weekly_sheet(db, voucherDate)
    rows = []
    for row in sheet["rows"]:
        item = {
            "일자": row["voucher_date"].isoformat() if hasattr(row["voucher_date"], "isoformat") else str(row["voucher_date"]),
            "봉투번호": row.get("envelope_no") or "",
            "이름": row.get("member_name") or "",
            "회별": row.get("department_name") or "",
            "구역": row.get("district_name") or "",
            "이체": "Y" if row.get("is_transfer") else "",
            "비고": row.get("note") or "",
            "합계": float(row.get("row_total") or 0),
        }
        for code, label in [
            ("11000", "십일조"),
            ("11200", "주일헌금"),
            ("13000", "후원회비"),
            ("11400", "집회헌금"),
            ("11100", "감사헌금"),
            ("11500", "기타헌금"),
            ("11300", "건축헌금"),
            ("12000", "선교회비"),
            ("12200", "세계선교"),
            ("14000", "사랑의헌금"),
            ("12100", "세계선교분담금"),
            ("23000", "기타수입"),
        ]:
            item[label] = float(row.get("offerings", {}).get(code, 0) or 0)
        rows.append(item)

    df = pd.DataFrame(rows)
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="주간헌금현황")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="weekly-offering-{voucherDate.isoformat()}.xlsx"'},
    )


@router.put("/weekly-offering", response_model=WeeklyOfferingResponse)
def sync_weekly_offering(payload: WeeklyOfferingBatchCreate, db: Session = Depends(get_db)):
    return _sync_weekly_sheet(db, payload)


@router.post("/weekly-offering", response_model=WeeklyOfferingResponse)
def create_weekly_offering(payload: WeeklyOfferingCreate, db: Session = Depends(get_db)):
    created, total_amount, cash_total = _create_weekly_vouchers(payload, db)
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


@router.post("/weekly-offering/bulk", response_model=WeeklyOfferingResponse)
def create_weekly_offering_bulk(payload: WeeklyOfferingBatchCreate, db: Session = Depends(get_db)):
    return _sync_weekly_sheet(db, payload)


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
    resolved_member_id = _resolve_member_for_year(db, payload.member_id, payload.voucher_date.year)
    voucher = Voucher(
        voucher_no=_build_voucher_no(),
        voucher_date=payload.voucher_date,
        entry_type=payload.entry_type,
        description=payload.description,
        amount=Decimal(payload.amount),
        fund_id=resolved_fund_id,
        fund_name=resolved_fund_name,
        account_id=payload.account_id,
        member_id=resolved_member_id,
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

    if "voucher_date" in update_data or "member_id" in update_data:
        final_date = update_data.get("voucher_date", voucher.voucher_date)
        target_year = final_date.year if hasattr(final_date, "year") else int(str(final_date).split("-")[0])
        member_id_to_resolve = update_data.get("member_id", voucher.member_id)
        update_data["member_id"] = _resolve_member_for_year(db, member_id_to_resolve, target_year)

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
