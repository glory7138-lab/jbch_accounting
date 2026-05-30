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
    year: int
    member_no: str | None = None
    name: str
    department_name: str | None = None
    district_name: str | None = None
    gender_or_section: str | None = None
    age_or_class: str | None = None
    salvation_date: str | None = None
    person_id: str | None = None


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


@router.get("/deposit-slip")
def get_deposit_slip(date_str: str = Query(..., alias="date"), db: Session = Depends(get_db)):
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="올바른 날짜 형식이 아닙니다 (YYYY-MM-DD).")

    vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account))
        .where(
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
            Voucher.voucher_date == target_date,
        )
    ).all()

    if not vouchers:
        return {
            "date": date_str,
            "slip_no": f"수입-{target_date.strftime('%Y%m%d')}-001",
            "items": [],
            "total_amount": 0.0,
        }

    categories = [
        {"name": "일반계정", "codes": {"11000", "11200", "11100", "11400", "11500", "23000"}},
        {"name": "교회학교 후원회비", "codes": {"13000"}},
        {"name": "건축헌금통장", "codes": {"11300"}},
        {"name": "사랑의헌금", "codes": {"14000"}},
        {"name": "선교회비", "codes": {"12000"}},
        {"name": "세계선교회비", "codes": {"12100", "12200"}},
        {"name": "해외후원참여헌금", "codes": {"25030", "15100", "15200", "15800", "15900"}},
        {"name": "E/V헌금", "codes": {"25040", "63", "62900"}},
    ]

    amounts = {cat["name"]: Decimal("0") for cat in categories}
    other_amount = Decimal("0")

    for v in vouchers:
        code = v.account.code if v.account else None
        amount = Decimal(v.amount or 0)
        matched = False
        for cat in categories:
            if code in cat["codes"]:
                amounts[cat["name"]] += amount
                matched = True
                break
        if not matched:
            name_lower = (v.account.name if v.account else "").lower()
            if "일반" in name_lower or (v.fund_name and "일반" in v.fund_name):
                amounts["일반계정"] += amount
            elif "후원" in name_lower:
                amounts["교회학교 후원회비"] += amount
            elif "건축" in name_lower:
                amounts["건축헌금통장"] += amount
            elif "사랑" in name_lower:
                amounts["사랑의헌금"] += amount
            elif "선교회비" in name_lower:
                amounts["선교회비"] += amount
            elif "세계선교" in name_lower:
                amounts["세계선교회비"] += amount
            elif "해외" in name_lower:
                amounts["해외후원참여헌금"] += amount
            elif "승강기" in name_lower or "e/v" in name_lower or "ev" in name_lower:
                amounts["E/V헌금"] += amount
            else:
                other_amount += amount

    if other_amount > 0:
        amounts["일반계정"] += other_amount

    total_amount = sum(amounts.values())
    items = []
    for cat in categories:
        name = cat["name"]
        items.append({
            "category": name,
            "amount": float(amounts[name]),
        })

    slip_no = f"수입-{target_date.strftime('%Y%m%d')}-001"

    return {
        "date": date_str,
        "slip_no": slip_no,
        "items": items,
        "total_amount": float(total_amount),
    }


@router.get("/deposit-slip.xlsx")
def export_deposit_slip(date_str: str = Query(..., alias="date"), db: Session = Depends(get_db)):
    res = get_deposit_slip(date_str=date_str, db=db)
    
    rows = []
    for item in res["items"]:
        rows.append({
            "입금일자": res["date"],
            "전표번호": res["slip_no"],
            "계정과목": item["category"],
            "금액": item["amount"],
        })
    
    if rows:
        rows.append({
            "입금일자": "합계",
            "전표번호": "",
            "계정과목": "",
            "금액": res["total_amount"],
        })
        
    df = pd.DataFrame(rows, columns=["입금일자", "전표번호", "계정과목", "금액"])
    return _frame_response(df, "입금전표", f"deposit-slip-{date_str}.xlsx")


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
def list_envelopes(
    query: str | None = Query(default=None),
    year: int | None = Query(default=None),
    db: Session = Depends(get_db)
):
    if year is None:
        year = date.today().year

    import re

    DEPT_ORDER = {
        "은장회": 1,
        "봉사회": 2,
        "어머니회": 3,
        "청년회": 4
    }

    def get_dept_priority(dept_name):
        if not dept_name:
            return 99
        return DEPT_ORDER.get(dept_name.strip(), 99)

    def get_member_no_numeric(member_no):
        if not member_no:
            return 999999
        match = re.search(r'\d+', member_no)
        if match:
            return int(match.group())
        return 999999

    statement = select(Member).where(Member.year == year)
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
    members = db.scalars(statement.limit(1000)).all()
    
    # 정렬 수행
    sorted_members = sorted(
        members,
        key=lambda m: (
            get_dept_priority(m.department_name),
            get_member_no_numeric(m.member_no),
            m.member_no or "",
            m.name or ""
        )
    )

    return [
        {
            "id": member.id,
            "person_id": member.person_id,
            "year": member.year,
            "member_no": member.member_no,
            "name": member.name,
            "department_name": member.department_name,
            "district_name": member.district_name,
            "gender_or_section": member.gender_or_section,
            "age_or_class": member.age_or_class,
            "salvation_date": member.salvation_date,
        }
        for member in sorted_members
    ]


@router.get("/envelopes.xlsx")
def export_envelopes(
    query: str | None = Query(default=None),
    year: int | None = Query(default=None),
    db: Session = Depends(get_db)
):
    rows = list_envelopes(query=query, year=year, db=db)
    df = pd.DataFrame(rows, columns=["member_no", "person_id", "name", "department_name", "district_name", "salvation_date"])
    df.columns = ["봉투번호", "ID", "이름", "회별", "구역", "구원일"]
    filename = f"offering-envelopes-{year or date.today().year}.xlsx"
    return _frame_response(df, "헌금봉투번호", filename)


@router.post("/envelopes")
def create_envelope(payload: EnvelopePayload, db: Session = Depends(get_db)):
    if payload.member_no:
        existing = db.scalar(
            select(Member)
            .where(Member.year == payload.year, Member.member_no == payload.member_no)
        )
        if existing:
            raise HTTPException(status_code=400, detail="해당 연도에 이미 사용 중인 봉투번호입니다.")

    import uuid
    person_id = payload.person_id
    if person_id:
        existing_in_year = db.scalar(
            select(Member)
            .where(Member.year == payload.year, Member.person_id == person_id)
        )
        if existing_in_year:
            raise HTTPException(status_code=400, detail="해당 성도는 이미 이 연도에 봉투가 배정되어 있습니다.")
    else:
        existing_pid = db.scalar(
            select(Member.person_id)
            .where(Member.name == payload.name)
            .limit(1)
        )
        person_id = existing_pid or f"P-{uuid.uuid4().hex[:8].upper()}"

    member = Member(
        person_id=person_id,
        year=payload.year,
        member_no=payload.member_no,
        name=payload.name,
        department_name=payload.department_name,
        district_name=payload.district_name,
        gender_or_section=payload.gender_or_section,
        age_or_class=payload.age_or_class,
        salvation_date=payload.salvation_date
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "person_id": member.person_id,
        "year": member.year,
        "member_no": member.member_no,
        "name": member.name,
        "department_name": member.department_name,
        "district_name": member.district_name,
        "gender_or_section": member.gender_or_section,
        "age_or_class": member.age_or_class,
        "salvation_date": member.salvation_date,
    }


@router.put("/envelopes/{member_id}")
def update_envelope(member_id: int, payload: EnvelopePayload, db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="봉투번호 대상을 찾지 못했습니다.")

    if payload.member_no:
        conflict = db.scalar(
            select(Member)
            .where(
                Member.year == payload.year,
                Member.member_no == payload.member_no,
                Member.id != member_id
            )
        )
        if conflict:
            raise HTTPException(status_code=400, detail="해당 연도에 이미 사용 중인 봉투번호입니다.")

    if payload.person_id and payload.person_id != member.person_id:
        conflict_pid = db.scalar(
            select(Member)
            .where(
                Member.year == payload.year,
                Member.person_id == payload.person_id,
                Member.id != member_id
            )
        )
        if conflict_pid:
            raise HTTPException(status_code=400, detail="해당 성도는 이미 이 연도에 봉투가 배정되어 있습니다.")

    for key, value in payload.model_dump().items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return {
        "id": member.id,
        "person_id": member.person_id,
        "year": member.year,
        "member_no": member.member_no,
        "name": member.name,
        "department_name": member.department_name,
        "district_name": member.district_name,
        "gender_or_section": member.gender_or_section,
        "age_or_class": member.age_or_class,
        "salvation_date": member.salvation_date,
    }


@router.delete("/envelopes/{member_id}")
def delete_envelope(member_id: int, db: Session = Depends(get_db)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="봉투번호 대상을 찾지 못했습니다.")

    # 연결된 전표들의 member_id를 None으로 일괄 수정하여 헌금 기록은 온전히 보존
    from app.models import Voucher
    db.query(Voucher).filter(Voucher.member_id == member_id).update({Voucher.member_id: None}, synchronize_session=False)

    db.delete(member)
    db.commit()
    return {"ok": True}


@router.get("/individual")
def get_individual_offerings(
    person_id: str | None = Query(default=None),
    query: str | None = Query(default=None),
    start_ym: str | None = Query(default=None),
    end_ym: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    if not person_id:
        stmt = select(Member.person_id, Member.name, Member.department_name, Member.district_name, Member.salvation_date).group_by(Member.person_id)
        if query:
            stmt = stmt.where(Member.name.contains(query.strip()))
        rows = db.execute(stmt.limit(100)).all()
        return {
            "search_mode": True,
            "results": [
                {
                    "person_id": r.person_id,
                    "name": r.name,
                    "department_name": r.department_name,
                    "district_name": r.district_name,
                    "salvation_date": r.salvation_date,
                }
                for r in rows
            ]
        }

    members = db.scalars(
        select(Member)
        .where(Member.person_id == person_id)
        .order_by(Member.year.desc())
    ).all()

    if not members:
        raise HTTPException(status_code=404, detail="해당 성도 정보를 찾을 수 없습니다.")

    member_ids = [m.id for m in members]

    start_date = None
    if start_ym:
        try:
            sy, sm = map(int, start_ym.split("-"))
            start_date = date(sy, sm, 1)
        except Exception:
            pass

    end_date = None
    if end_ym:
        try:
            ey, em = map(int, end_ym.split("-"))
            end_date = date(ey, em, monthrange(ey, em)[1])
        except Exception:
            pass

    vouchers_stmt = select(Voucher).options(joinedload(Voucher.account)).where(Voucher.member_id.in_(member_ids))
    if start_date:
        vouchers_stmt = vouchers_stmt.where(Voucher.voucher_date >= start_date)
    if end_date:
        vouchers_stmt = vouchers_stmt.where(Voucher.voucher_date <= end_date)

    vouchers = db.scalars(
        vouchers_stmt.order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    ).all()

    annual_summary = defaultdict(Decimal)
    category_summary = defaultdict(Decimal)
    detail_rows = []

    for v in vouchers:
        annual_summary[str(v.voucher_date.year)] += v.amount
        if v.account:
            details = []
            if v.account.middle_category: details.append(v.account.middle_category)
            if v.account.report_category: details.append(v.account.report_category)
            if details:
                category = f"{v.account.name} ({' > '.join(details)})"
            else:
                category = v.account.name
        else:
            category = "기타"
        category_summary[category] += v.amount

        detail_rows.append({
            "id": v.id,
            "voucher_date": v.voucher_date.isoformat() if hasattr(v.voucher_date, "isoformat") else str(v.voucher_date),
            "description": v.description,
            "amount": float(v.amount),
            "account_code": v.account.code if v.account else None,
            "account_name": category if v.account else None,
            "note": v.note,
        })

    return {
        "search_mode": False,
        "person_id": person_id,
        "name": members[0].name,
        "history": [
            {
                "year": m.year,
                "member_no": m.member_no,
                "department_name": m.department_name,
                "district_name": m.district_name,
            }
            for m in members
        ],
        "annual_summary": {k: float(v) for k, v in annual_summary.items()},
        "category_summary": {k: float(v) for k, v in category_summary.items()},
        "total_amount": float(sum(annual_summary.values())),
        "vouchers": detail_rows
    }


@router.get("/individual.xlsx")
def export_individual_offerings(
    person_id: str = Query(...),
    start_ym: str | None = Query(default=None),
    end_ym: str | None = Query(default=None),
    db: Session = Depends(get_db)
):
    res = get_individual_offerings(person_id=person_id, start_ym=start_ym, end_ym=end_ym, db=db)
    
    df_vouchers = pd.DataFrame(res["vouchers"])
    if not df_vouchers.empty:
        df_vouchers = df_vouchers.drop(columns=["id"], errors="ignore")
        df_vouchers.columns = ["일자", "적요", "금액", "계정코드", "계정과목", "비고"]
        df_vouchers = df_vouchers[["일자", "계정과목", "금액", "적요", "비고"]]
    else:
        df_vouchers = pd.DataFrame(columns=["일자", "계정과목", "금액", "적요", "비고"])
    
    df_annual = pd.DataFrame([{"연도": k, "금액": v} for k, v in res["annual_summary"].items()])
    df_category = pd.DataFrame([{"헌금구분": k, "금액": v} for k, v in res["category_summary"].items()])

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df_vouchers.to_excel(writer, index=False, sheet_name="상세헌금내역")
        df_annual.to_excel(writer, index=False, sheet_name="연도별집계")
        df_category.to_excel(writer, index=False, sheet_name="종류별집계")
    buffer.seek(0)
    
    # We must quote or encode the filename properly
    import urllib.parse
    encoded_filename = urllib.parse.quote(f"individual-offering-{res['name']}.xlsx")
    
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"},
    )
