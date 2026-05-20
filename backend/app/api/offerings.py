from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Member, Voucher

router = APIRouter(prefix="/offerings", tags=["offerings"])

WEEKLY_SOURCE_WORKBOOK = "weekly_offering_ui"
WEEKLY_SOURCE_SHEET = "weekly_offering_entry"
OFFERING_COLUMNS = [
    ("11000", "십일조"),
    ("11200", "주일헌금"),
    ("12100", "세계선교분담금"),
    ("13000", "후원회비"),
    ("11300", "건축헌금"),
    ("12000", "선교회비"),
    ("12200", "세계선교"),
    ("14000", "사랑의헌금"),
]
ALL_WEEKLY_CODES = {
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


class EnvelopePayload(BaseModel):
    member_no: str | None = None
    name: str
    department_name: str | None = None
    district_name: str | None = None
    gender_or_section: str | None = None
    age_or_class: str | None = None


def _period_bounds(year: int, month: int | None) -> tuple[date, date]:
    if month:
        return date(year, month, 1), date(year, month, monthrange(year, month)[1])
    return date(year, 1, 1), date(year, 12, 31)


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


def _weekly_voucher_statement(start_date: date, end_date: date):
    return (
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.member))
        .where(
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .order_by(Voucher.voucher_date.asc(), Voucher.member_id.asc(), Voucher.counterparty.asc(), Voucher.id.asc())
    )


def _weekly_group_key(voucher: Voucher) -> tuple:
    parsed = _parse_weekly_note(voucher.note)
    return (
        voucher.voucher_date.isoformat(),
        voucher.member_id or 0,
        parsed.get("envelope_no") or "",
        voucher.counterparty or "",
    )


def _build_weekly_rows(vouchers: list[Voucher]) -> list[dict]:
    grouped: dict[tuple, list[Voucher]] = defaultdict(list)
    for voucher in vouchers:
        grouped[_weekly_group_key(voucher)].append(voucher)

    rows: list[dict] = []
    for _, group in grouped.items():
        first = group[0]
        member = first.member
        parsed = _parse_weekly_note(first.note)
        offerings = {code: Decimal("0") for code in ALL_WEEKLY_CODES}
        row_total = Decimal("0")

        for voucher in group:
            code = voucher.account.code if voucher.account else None
            if code in offerings:
                amount = Decimal(voucher.amount or 0)
                offerings[code] += amount
                row_total += amount

        rows.append(
            {
                "voucher_date": first.voucher_date.isoformat(),
                "envelope_no": parsed.get("envelope_no") or (member.member_no if member else None) or "",
                "member_id": member.id if member else first.member_id,
                "member_name": (member.name if member else first.counterparty) or "",
                "department_name": parsed.get("department_name") or (member.department_name if member else None) or "",
                "district_name": parsed.get("district_name") or (member.district_name if member else member.gender_or_section if member else None) or "",
                "is_transfer": parsed.get("is_transfer", False),
                "note": parsed.get("note") or "",
                "offerings": {code: value for code, value in offerings.items() if value > 0},
                "row_total": row_total,
            }
        )

    rows.sort(key=lambda row: (row["voucher_date"], str(row.get("envelope_no") or ""), row.get("member_name") or ""))
    return rows


def _weekly_rows_by_period(db: Session, year: int, month: int | None) -> list[dict]:
    start_date, end_date = _period_bounds(year, month)
    vouchers = db.scalars(_weekly_voucher_statement(start_date, end_date)).unique().all()
    return _build_weekly_rows(vouchers)


def _rows_to_frame(rows: list[dict]) -> pd.DataFrame:
    columns = ["일자", "봉투번호", "이름", "회별", "구역"] + [label for _, label in OFFERING_COLUMNS] + ["합계", "비고"]
    export_rows = []
    for row in rows:
        item = {
            "일자": row["voucher_date"],
            "봉투번호": row.get("envelope_no") or "",
            "이름": row.get("member_name") or "",
            "회별": row.get("department_name") or "",
            "구역": row.get("district_name") or "",
            "합계": float(row.get("row_total") or 0),
            "비고": row.get("note") or "",
        }
        for code, label in OFFERING_COLUMNS:
            item[label] = float(row.get("offerings", {}).get(code, 0) or 0)
        export_rows.append(item)
    return pd.DataFrame(export_rows, columns=columns)


def _frame_response(df: pd.DataFrame, sheet_name: str, filename: str) -> StreamingResponse:
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/weekly-cumulative")
def get_weekly_cumulative(year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    rows = _weekly_rows_by_period(db, year, month)
    total_amount = sum((Decimal(row["row_total"]) for row in rows), Decimal("0"))
    return {
        "year": year,
        "month": month,
        "rows": rows,
        "total_amount": total_amount,
        "row_count": len(rows),
    }


@router.get("/weekly-cumulative.xlsx")
def export_weekly_cumulative(year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    rows = _weekly_rows_by_period(db, year, month)
    df = _rows_to_frame(rows)
    suffix = f"{year}-{month:02d}" if month else str(year)
    return _frame_response(df, "주간헌금누계", f"weekly-cumulative-{suffix}.xlsx")


@router.get("/department-summary")
def get_department_summary(year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    rows = _weekly_rows_by_period(db, year, month)
    summary: dict[str, dict] = {}
    for row in rows:
        department = (row.get("department_name") or "미분류").strip() or "미분류"
        item = summary.setdefault(
            department,
            {
                "department_name": department,
                "participant_counts": {code: 0 for code, _ in OFFERING_COLUMNS},
                "amounts": {code: Decimal("0") for code, _ in OFFERING_COLUMNS},
                "total_participants": 0,
                "total_amount": Decimal("0"),
            },
        )
        participated = False
        for code, _ in OFFERING_COLUMNS:
            amount = Decimal(row.get("offerings", {}).get(code, 0) or 0)
            if amount > 0:
                item["participant_counts"][code] += 1
                item["amounts"][code] += amount
                participated = True
        if participated:
            item["total_participants"] += 1
        item["total_amount"] += Decimal(row.get("row_total") or 0)

    result_rows = sorted(summary.values(), key=lambda item: item["department_name"])
    return {
        "year": year,
        "month": month,
        "columns": [{"code": code, "label": label} for code, label in OFFERING_COLUMNS],
        "rows": result_rows,
    }


@router.get("/department-summary-counts.xlsx")
def export_department_summary_counts(year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    summary = get_department_summary(year=year, month=month, db=db)
    columns = ["회별"] + [item["label"] for item in summary["columns"]] + ["전체 참여자수"]
    rows = []
    for row in summary["rows"]:
        item = {"회별": row["department_name"], "전체 참여자수": row["total_participants"]}
        for column in summary["columns"]:
            item[column["label"]] = row["participant_counts"][column["code"]]
        rows.append(item)
    return _frame_response(pd.DataFrame(rows, columns=columns), "회별참여자수", f"department-counts-{year}{f'-{month:02d}' if month else ''}.xlsx")


@router.get("/department-summary-amounts.xlsx")
def export_department_summary_amounts(year: int = Query(..., ge=2000, le=2100), month: int | None = Query(default=None, ge=1, le=12), db: Session = Depends(get_db)):
    summary = get_department_summary(year=year, month=month, db=db)
    columns = ["회별"] + [item["label"] for item in summary["columns"]] + ["전체 금액"]
    rows = []
    for row in summary["rows"]:
        item = {"회별": row["department_name"], "전체 금액": float(row["total_amount"])}
        for column in summary["columns"]:
            item[column["label"]] = float(row["amounts"][column["code"]])
        rows.append(item)
    return _frame_response(pd.DataFrame(rows, columns=columns), "회별참여금액", f"department-amounts-{year}{f'-{month:02d}' if month else ''}.xlsx")


@router.get("/envelopes")
def list_envelopes(query: str | None = Query(default=None), db: Session = Depends(get_db)):
    statement = select(Member).order_by(Member.member_no.asc(), Member.name.asc())
    keyword = (query or "").strip()
    if keyword:
        statement = statement.where(
            or_(
                Member.member_no.contains(keyword),
                Member.name.contains(keyword),
                Member.department_name.contains(keyword),
                Member.district_name.contains(keyword),
            )
        )
    members = db.scalars(statement.limit(500)).all()
    return [
        {
            "id": member.id,
            "member_no": member.member_no,
            "name": member.name,
            "department_name": member.department_name,
            "district_name": member.district_name,
            "gender_or_section": member.gender_or_section,
            "age_or_class": member.age_or_class,
        }
        for member in members
    ]


@router.get("/envelopes.xlsx")
def export_envelopes(query: str | None = Query(default=None), db: Session = Depends(get_db)):
    rows = list_envelopes(query=query, db=db)
    df = pd.DataFrame(rows, columns=["member_no", "name", "department_name", "district_name", "gender_or_section", "age_or_class"])
    df.columns = ["봉투번호", "이름", "회별", "구역", "구분", "반/연령"]
    return _frame_response(df, "헌금봉투번호", "offering-envelopes.xlsx")


@router.post("/envelopes")
def create_envelope(payload: EnvelopePayload, db: Session = Depends(get_db)):
    if payload.member_no:
        existing = db.scalar(select(Member).where(Member.member_no == payload.member_no))
        if existing:
            raise HTTPException(status_code=400, detail="이미 사용 중인 봉투번호입니다.")
    member = Member(**payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "member_no": member.member_no,
        "name": member.name,
        "department_name": member.department_name,
        "district_name": member.district_name,
        "gender_or_section": member.gender_or_section,
        "age_or_class": member.age_or_class,
    }


@router.put("/envelopes/{member_id}")
def update_envelope(member_id: int, payload: EnvelopePayload, db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="봉투번호 대상을 찾지 못했습니다.")

    if payload.member_no:
        conflict = db.scalar(select(Member).where(and_(Member.member_no == payload.member_no, Member.id != member_id)))
        if conflict:
            raise HTTPException(status_code=400, detail="이미 사용 중인 봉투번호입니다.")

    for key, value in payload.model_dump().items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "member_no": member.member_no,
        "name": member.name,
        "department_name": member.department_name,
        "district_name": member.district_name,
        "gender_or_section": member.gender_or_section,
        "age_or_class": member.age_or_class,
    }
