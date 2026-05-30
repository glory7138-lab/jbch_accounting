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

# ---------------------------------------------------------------------------
# Category definitions – based on the church's 계정코드 Excel sheet
# ---------------------------------------------------------------------------

# Editable categories: can directly add income (non-offering) and expenses
# Read-only categories: auto-classified from the parent editable category

WEEKLY_SOURCE_WORKBOOK = "weekly_offering_ui"
WEEKLY_SOURCE_SHEET = "weekly_offering_entry"

# Account code → ledger category mapping (from 재정구분 column in Excel)
# Income codes (계정유형 != '지출')
INCOME_CODE_TO_CATEGORY = {
    # 일반 (통합계정)
    "11000": "통합계정",  # 십일조
    "11010": "통합계정",  # 십일조 외
    "11100": "통합계정",  # 감사헌금
    "11200": "통합계정",  # 주일헌금
    "11400": "통합계정",  # 전도집회헌금
    "11500": "통합계정",  # 기타헌금(회별)
    "11510": "통합계정",
    "11520": "통합계정",
    "11530": "통합계정",
    "11540": "통합계정",
    "11550": "통합계정",
    "11560": "통합계정",
    "11600": "통합계정",  # 특별헌금
    "11610": "통합계정",
    "11620": "통합계정",
    "11999": "통합계정",  # 기타헌금
    "23020": "통합계정",  # 차입금(사택담보) - 일반
    "23100": "통합계정",  # 대여금회수
    "23110": "통합계정",
    "23120": "통합계정",
    "23150": "통합계정",  # 건축->일반 상환
    "23170": "통합계정",  # 사랑->일반 상환
    "23700": "통합계정",  # 퇴직금적립
    "24100": "통합계정",  # 방송실수입
    "24200": "통합계정",  # 서적부수입
    "24210": "통합계정",
    "24220": "통합계정",
    "24300": "통합계정",  # 미선부수입
    "24310": "통합계정",
    "24400": "통합계정",  # 자판기판매수입
    "24500": "통합계정",  # 매점수입
    "24620": "통합계정",  # 회장단식사찬조
    "24700": "통합계정",  # 이자수입(은행)
    "24710": "통합계정",  # 이자수입(일반)
    "24800": "통합계정",  # 예비비환입금
    "25000": "통합계정",  # 버스차비
    "25010": "통합계정",
    "25020": "통합계정",
    "25030": "통합계정",
    "30000": "통합계정",  # 이체오류수입
    # 건축계정
    "11300": "건축계정",  # 건축헌금
    "23000": "건축계정",  # 차입금 (건축)
    "23010": "건축계정",  # 차입금(은행)
    "23030": "건축계정",  # 차입금(마산교회)
    "23130": "건축계정",  # 일반->건축 상환
    "23180": "건축계정",  # 사랑->건축 상환
    "24720": "건축계정",  # 이자수입(건축)
    # 승강기계정
    "11310": "승강기계정",  # 승강기헌금
    # 교회학교후원회비 (sub of 통합계정)
    "13000": "통합계정",  # 교회학교후원회비
    "13010": "통합계정",
    "13020": "통합계정",
    # 사랑의헌금 (sub of 통합계정)
    "14000": "통합계정",  # 사랑의헌금
    "23140": "통합계정",  # 일반->사랑 상환
    "23160": "통합계정",  # 건축->사랑 상환
    "24730": "통합계정",  # 이자수입(사랑)
    # 선교회비 (sub of 통합계정)
    "12000": "통합계정",  # 선교회비
    "12100": "통합계정",  # 세계선교분담금
    "12200": "통합계정",  # 세계선교헌금
    # 해외후원
    "15000": "해외후원",  # 해외후원헌금
    "15100": "해외후원",
    "15200": "해외후원",
    "15800": "해외후원",
    "15900": "해외후원",
    # 국내선교
    "16100": "국내선교",  # 국내선교헌금
    "24600": "국내선교",  # 잡수입 (국내선교)
}

# Expense codes (계정유형 = '지출')
EXPENSE_CODE_TO_CATEGORY = {
    # 일반 (통합계정) - 대부분의 지출
    "31200": "통합계정", "31210": "통합계정",  # 총회비
    "31300": "통합계정",  # 선교회비(지출)
    "31310": "통합계정",  # 미디어선교회비
    "31500": "통합계정", "31510": "통합계정", "31520": "통합계정",
    "31530": "통합계정", "31540": "통합계정", "31599": "통합계정",
    "31600": "통합계정", "31700": "통합계정", "31710": "통합계정",
    "31720": "통합계정", "31730": "통합계정", "31800": "통합계정",  # 사무&비품
    "31900": "통합계정", "31910": "통합계정", "31920": "통합계정",
    "31930": "통합계정", "31940": "통합계정", "31950": "통합계정",
    "31951": "통합계정", "31952": "통합계정", "31953": "통합계정",
    "31960": "통합계정", "31970": "통합계정", "31980": "통합계정",
    "31990": "통합계정",  # 운영비
    "32010": "통합계정", "32020": "통합계정", "32030": "통합계정",
    "32040": "통합계정", "32080": "통합계정", "32090": "통합계정",
    "32100": "통합계정", "32110": "통합계정", "32120": "통합계정",
    "32130": "통합계정", "32140": "통합계정",  # 공과금
    "32200": "통합계정", "32210": "통합계정", "32220": "통합계정",
    "32230": "통합계정",  # 교회학교후원회비(지출)
    "32410": "통합계정", "32420": "통합계정", "32425": "통합계정",
    "32431": "통합계정", "32432": "통합계정", "32433": "통합계정",
    "32434": "통합계정", "32440": "통합계정", "32450": "통합계정",
    "32460": "통합계정", "32470": "통합계정", "32480": "통합계정",
    "32490": "통합계정", "32499": "통합계정",  # 차량유지비
    "33010": "통합계정", "33020": "통합계정", "33021": "통합계정",
    "33022": "통합계정", "33023": "통합계정", "33030": "통합계정",
    "33040": "통합계정", "33050": "통합계정", "33051": "통합계정",
    "33052": "통합계정",  # 전도집회비
    "34010": "통합계정", "34020": "통합계정", "34030": "통합계정",
    "34040": "통합계정", "34050": "통합계정", "34060": "통합계정",
    "34070": "통합계정", "34080": "통합계정", "34100": "통합계정",
    "34200": "통합계정", "34300": "통합계정", "34310": "통합계정",
    "34500": "통합계정", "34600": "통합계정", "34700": "통합계정",
    "34800": "통합계정",  # 시설&운영관리
    "35010": "통합계정", "35020": "통합계정", "35030": "통합계정",
    "35040": "통합계정", "35100": "통합계정",  # 주일말씀
    "35110": "통합계정",  # 기타(선교사 방문)
    "41100": "통합계정",  # 세계선교헌금(지출)
    "41200": "통합계정",  # 세계선교분담금(지출)
    "41210": "통합계정",  # 필리핀 퀘존 선교회비
    "41300": "통합계정", "41310": "통합계정", "41400": "통합계정",
    "41500": "통합계정", "41510": "통합계정",  # 타교회헌금
    "42110": "통합계정", "42120": "통합계정", "42130": "통합계정",
    "42140": "통합계정", "42150": "통합계정", "42160": "통합계정",
    "42170": "통합계정", "42180": "통합계정", "42190": "통합계정",
    "42200": "통합계정",  # 봉사부서
    "51000": "통합계정", "51100": "통합계정", "51110": "통합계정",
    "51120": "통합계정", "51130": "통합계정", "51140": "통합계정",
    "51150": "통합계정", "51200": "통합계정", "51210": "통합계정",
    "51220": "통합계정", "51230": "통합계정", "51235": "통합계정",
    "51240": "통합계정", "51250": "통합계정", "51300": "통합계정",
    "51400": "통합계정", "51500": "통합계정", "51510": "통합계정",
    "51520": "통합계정",  # 기타
    "51600": "통합계정", "51610": "통합계정", "51620": "통합계정",
    "51630": "통합계정", "51640": "통합계정", "51650": "통합계정",
    "51700": "통합계정", "51710": "통합계정",  # 대여금/심방
    "99990": "통합계정",  # 예비비
    "90000": "통합계정",  # 이체오류지출
    # 건축계정 (지출)
    "60100": "건축계정", "60200": "건축계정", "60300": "건축계정",
    "60400": "건축계정", "60500": "건축계정",
    "61000": "건축계정", "61010": "건축계정", "61020": "건축계정",
    "61030": "건축계정",
    "62000": "건축계정", "62100": "건축계정", "62200": "건축계정",
    "62300": "건축계정", "62400": "건축계정", "62500": "건축계정",
    "62600": "건축계정", "62700": "건축계정", "62800": "건축계정",
    "63000": "건축계정",  # 스타리아
    # 승강기계정 (지출)
    "62900": "승강기계정",
    # 사랑의헌금 (지출) - 재정구분=사랑의 헌금
    "70000": "통합계정", "70010": "통합계정",
    "70100": "통합계정", "70110": "통합계정",
    "70200": "통합계정", "70210": "통합계정",
    "70300": "통합계정", "70310": "통합계정",
    "70400": "통합계정", "70410": "통합계정", "70420": "통합계정",
    "70429": "통합계정", "70500": "통합계정",
    "71000": "통합계정", "71010": "통합계정", "71020": "통합계정",
    # 해외후원 (지출)
    "45000": "해외후원", "45100": "해외후원", "45200": "해외후원",
    # 국내선교 (지출)
    "45900": "국내선교", "45910": "국내선교",
}

# Sub-account classification: which income codes belong to which sub-account
# These sub-accounts are READ-ONLY views derived from 통합계정
SUB_ACCOUNT_INCOME_CODES = {
    "일반계정": {"11000", "11010", "11100", "11200", "11400", "11500",
                "11510", "11520", "11530", "11540", "11550", "11560",
                "11600", "11610", "11620", "11999",
                "23020", "23100", "23110", "23120", "23150", "23170",
                "23700", "24100", "24200", "24210", "24220", "24300",
                "24310", "24400", "24500", "24620", "24700", "24710",
                "24800", "25000", "25010", "25020", "25030", "30000"},
    "교회학교후원회비": {"13000", "13010", "13020"},
    "사랑의헌금": {"14000", "23140", "23160", "24730"},
    "선교회비": {"12000", "12100", "12200"},
}

# Sub-account expense classification
SUB_ACCOUNT_EXPENSE_CODES = {
    "일반계정": {
        "31200", "31210", "31300", "31310",
        "31500", "31510", "31520", "31530", "31540", "31599",
        "31600", "31700", "31710", "31720", "31730", "31800",
        "31900", "31910", "31920", "31930", "31940", "31950",
        "31951", "31952", "31953", "31960", "31970", "31980", "31990",
        "32010", "32020", "32030", "32040", "32080", "32090",
        "32100", "32110", "32120", "32130", "32140",
        "32410", "32420", "32425", "32431", "32432", "32433", "32434",
        "32440", "32450", "32460", "32470", "32480", "32490", "32499",
        "33010", "33020", "33021", "33022", "33023", "33030",
        "33040", "33050", "33051", "33052",
        "34010", "34020", "34030", "34040", "34050", "34060",
        "34070", "34080", "34100", "34200", "34300", "34310",
        "34500", "34600", "34700", "34800",
        "35010", "35020", "35030", "35040", "35100", "35110",
        "41100", "41200", "41210",
        "41300", "41310", "41400", "41500", "41510",
        "42110", "42120", "42130", "42140", "42150", "42160",
        "42170", "42180", "42190", "42200",
        "51000", "51100", "51110", "51120", "51130", "51140", "51150",
        "51200", "51210", "51220", "51230", "51235", "51240", "51250",
        "51300", "51400", "51500", "51510", "51520",
        "51600", "51610", "51620", "51630", "51640", "51650",
        "51700", "51710",
        "99990", "90000",
    },
    "교회학교후원회비": {"32200", "32210", "32220", "32230"},
    "사랑의헌금": {
        "70000", "70010", "70100", "70110", "70200", "70210",
        "70300", "70310", "70400", "70410", "70420", "70429",
        "70500", "71000", "71010", "71020",
    },
    "선교회비": set(),  # 선교회비 지출은 일반계정 내 31300 등으로 이미 포함
}


LEDGER_CATEGORIES = [
    {"slug": "integrated", "name": "통합계정", "editable": True, "is_sub": False},
    {"slug": "general", "name": "일반계정", "editable": True, "is_sub": True, "parent": "통합계정"},
    {"slug": "school-support", "name": "교회학교후원회비", "editable": True, "is_sub": True, "parent": "통합계정"},
    {"slug": "love-offering", "name": "사랑의헌금", "editable": True, "is_sub": True, "parent": "통합계정"},
    {"slug": "mission-fee", "name": "선교회비", "editable": True, "is_sub": True, "parent": "통합계정"},
    {"slug": "building", "name": "건축계정", "editable": True, "is_sub": False},
    {"slug": "elevator", "name": "승강기계정", "editable": True, "is_sub": False},
    {"slug": "overseas", "name": "해외후원", "editable": True, "is_sub": False},
    {"slug": "domestic-mission", "name": "국내선교", "editable": True, "is_sub": False},
    {"slug": "expense-view", "name": "지출금액", "editable": False, "is_sub": False},
    {"slug": "account-codes", "name": "계정코드", "editable": True, "is_sub": False},
]


def _get_sub_accounts_for_parent(parent_name: str) -> list[str]:
    return [cat["name"] for cat in LEDGER_CATEGORIES if cat.get("parent") == parent_name]


def _get_valid_account_codes(category_name: str) -> set[str] | None:
    sub_accounts = _get_sub_accounts_for_parent("통합계정")
    if category_name in sub_accounts:
        in_codes = SUB_ACCOUNT_INCOME_CODES.get(category_name, set())
        ex_codes = SUB_ACCOUNT_EXPENSE_CODES.get(category_name, set())
        return in_codes | ex_codes
    elif category_name == "통합계정":
        codes = set()
        for code, cat in INCOME_CODE_TO_CATEGORY.items():
            if cat == "통합계정":
                codes.add(code)
        for code, cat in EXPENSE_CODE_TO_CATEGORY.items():
            if cat == "통합계정":
                codes.add(code)
        for sub in sub_accounts:
            codes.update(SUB_ACCOUNT_INCOME_CODES.get(sub, set()))
            codes.update(SUB_ACCOUNT_EXPENSE_CODES.get(sub, set()))
        return codes
    else:
        codes = set()
        for code, cat in INCOME_CODE_TO_CATEGORY.items():
            if cat == category_name:
                codes.add(code)
        for code, cat in EXPENSE_CODE_TO_CATEGORY.items():
            if cat == category_name:
                codes.add(code)
        return codes


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


def _get_category_def(category_name: str) -> dict | None:
    for cat in LEDGER_CATEGORIES:
        if cat["name"] == category_name:
            return cat
    return None


def _ensure_fund(db: Session, fund_name: str) -> Fund:
    existing = db.scalar(select(Fund).where(Fund.name == fund_name))
    if existing:
        return existing
    fund = Fund(code=fund_name.replace(' ', '-'), name=fund_name, is_active=True)
    db.add(fund)
    db.flush()
    return fund


def _entry_to_dict(voucher: Voucher, source_label: str | None = None) -> dict:
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
        "source_label": source_label,
    }


def _build_voucher_no(prefix: str = "L") -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def _get_offering_vouchers(db: Session, start_date: date, end_date: date, category_name: str) -> list[Voucher]:
    """Get offering (weekly_offering_ui) vouchers whose account codes map to the given category."""
    vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    ).unique().all()

    # Filter by account code mapping
    sub_accounts = _get_sub_accounts_for_parent("통합계정")
    result = []
    for v in vouchers:
        code = v.account.code if v.account else None
        if not code:
            continue
        if category_name in sub_accounts:
            if code in SUB_ACCOUNT_INCOME_CODES.get(category_name, set()):
                result.append(v)
        else:
            mapped_cat = INCOME_CODE_TO_CATEGORY.get(code)
            if mapped_cat == category_name:
                result.append(v)
    return result


def _get_manual_vouchers(db: Session, start_date: date, end_date: date, category_name: str) -> list[Voucher]:
    """Get manually entered vouchers (from ledger_ui) for the given category, including sub-accounts mapping."""
    sub_accounts = _get_sub_accounts_for_parent("통합계정")
    
    if category_name == "통합계정":
        sheets = ["통합계정"] + sub_accounts
        return list(db.scalars(
            select(Voucher)
            .options(joinedload(Voucher.account), joinedload(Voucher.fund))
            .where(
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
                Voucher.source_workbook == "ledger_ui",
                Voucher.source_sheet.in_(sheets),
            )
            .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
        ).unique().all())
        
    elif category_name in sub_accounts:
        vouchers = db.scalars(
            select(Voucher)
            .options(joinedload(Voucher.account), joinedload(Voucher.fund))
            .where(
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
                Voucher.source_workbook == "ledger_ui",
                Voucher.source_sheet.in_([category_name, "통합계정"]),
            )
            .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
        ).unique().all()
        
        income_codes = SUB_ACCOUNT_INCOME_CODES.get(category_name, set())
        expense_codes = SUB_ACCOUNT_EXPENSE_CODES.get(category_name, set())
        
        result = []
        for v in vouchers:
            if v.source_sheet == category_name:
                result.append(v)
            elif v.source_sheet == "통합계정":
                code = v.account.code if v.account else None
                if code:
                    if v.entry_type == "income" and code in income_codes:
                        result.append(v)
                    elif v.entry_type == "expense" and code in expense_codes:
                        result.append(v)
        return result
        
    else:
        return list(db.scalars(
            select(Voucher)
            .options(joinedload(Voucher.account), joinedload(Voucher.fund))
            .where(
                Voucher.voucher_date >= start_date,
                Voucher.voucher_date <= end_date,
                Voucher.source_workbook == "ledger_ui",
                Voucher.source_sheet == category_name,
            )
            .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
        ).unique().all())


def _get_sub_account_vouchers(db: Session, start_date: date, end_date: date, sub_name: str) -> list[Voucher]:
    """For read-only sub-accounts: get vouchers from 통합계정 filtered by account code."""
    income_codes = SUB_ACCOUNT_INCOME_CODES.get(sub_name, set())
    expense_codes = SUB_ACCOUNT_EXPENSE_CODES.get(sub_name, set())
    all_codes = income_codes | expense_codes
    if not all_codes:
        return []

    # Get all offering vouchers for 통합계정
    offering_vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(
            Voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK,
            Voucher.source_sheet == WEEKLY_SOURCE_SHEET,
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    ).unique().all()

    # Get all manual vouchers for 통합계정
    manual_vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            Voucher.source_workbook == "ledger_ui",
            Voucher.source_sheet == "통합계정",
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    ).unique().all()

    result = []
    for v in offering_vouchers + manual_vouchers:
        code = v.account.code if v.account else None
        if not code:
            # For manual entries without account code in sub-accounts,
            # check by entry_type and category association
            if v.source_workbook == "ledger_ui":
                # Include if fund_name matches
                fund_name = v.fund.name if v.fund else (v.fund_name or "")
                if fund_name == sub_name:
                    result.append(v)
            continue
        if v.entry_type == "income" and code in income_codes:
            result.append(v)
        elif v.entry_type == "expense" and code in expense_codes:
            result.append(v)
    return result


def _get_expense_view_vouchers(db: Session, start_date: date, end_date: date) -> list[Voucher]:
    """Get all expense vouchers from 통합계정 only."""
    # Offering income vouchers (all from weekly_offering_ui)
    # Manual vouchers from 통합계정
    manual_vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(
            Voucher.voucher_date >= start_date,
            Voucher.voucher_date <= end_date,
            Voucher.source_workbook == "ledger_ui",
            Voucher.source_sheet == "통합계정",
            Voucher.entry_type == "expense",
        )
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    ).unique().all()
    return list(manual_vouchers)


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@router.get("/categories")
def get_categories():
    return LEDGER_CATEGORIES


@router.get("/accounts")
def list_ledger_accounts(category: str, db: Session = Depends(get_db)):
    valid_codes = _get_valid_account_codes(category)
    if valid_codes is None:
        statement = select(Account).where(Account.is_active == True)
    else:
        statement = select(Account).where(and_(Account.is_active == True, Account.code.in_(list(valid_codes))))
    return db.scalars(statement.order_by(Account.code.asc())).all()


@router.get("/entries")
def list_entries(
    category: str = Query(...),
    year: int = Query(..., ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
):
    start_date, end_date = _period_bounds(year, month)
    cat_def = _get_category_def(category)

    if not cat_def:
        raise HTTPException(status_code=400, detail=f"알 수 없는 장부 구분: {category}")

    rows = []
    offering_rows = []
    manual_rows = []

    if category == "지출금액":
        # Expense-only view for 통합계정
        vouchers = _get_expense_view_vouchers(db, start_date, end_date)
        rows = [_entry_to_dict(v, "수동입력") for v in vouchers]
    elif cat_def.get("is_sub") and not cat_def.get("editable"):
        # Read-only sub-account (일반계정, 교회학교후원회비, 사랑의헌금, 선교회비)
        vouchers = _get_sub_account_vouchers(db, start_date, end_date, category)
        rows = [_entry_to_dict(v, "자동분류") for v in vouchers]
    else:
        # Editable category (통합계정, 건축계정, 승강기계정, 해외후원, 국내선교)
        offering_vouchers = _get_offering_vouchers(db, start_date, end_date, category)
        offering_rows = [_entry_to_dict(v, "헌금현황") for v in offering_vouchers]

        manual_vouchers = _get_manual_vouchers(db, start_date, end_date, category)
        manual_rows = [_entry_to_dict(v, "수동입력") for v in manual_vouchers]

        rows = offering_rows + manual_rows

    total_amount = sum(r["amount"] for r in rows)

    return {
        "category": category,
        "year": year,
        "month": month,
        "editable": cat_def.get("editable", False),
        "is_sub": cat_def.get("is_sub", False),
        "offering_rows": offering_rows if not cat_def.get("is_sub") and category != "지출금액" else [],
        "manual_rows": manual_rows if not cat_def.get("is_sub") and category != "지출금액" else rows,
        "rows": rows,
        "total_amount": float(total_amount),
    }


@router.get("/entries.xlsx")
def export_entries(
    category: str = Query(...),
    year: int = Query(..., ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
):
    result = list_entries(category=category, year=year, month=month, db=db)
    df = pd.DataFrame(result["rows"])
    if not df.empty:
        cols_available = [c for c in ["voucher_date", "voucher_no", "entry_type", "account_code", "account_name", "description", "amount", "counterparty", "note", "source_label"] if c in df.columns]
        df = df[cols_available]
        col_names = {"voucher_date": "일자", "voucher_no": "전표번호", "entry_type": "유형",
                      "account_code": "계정코드", "account_name": "계정명", "description": "적요",
                      "amount": "금액", "counterparty": "거래처", "note": "비고", "source_label": "출처"}
        df.columns = [col_names.get(c, c) for c in df.columns]
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
    cat_def = _get_category_def(payload.category_name)
    if not cat_def or not cat_def.get("editable"):
        raise HTTPException(status_code=403, detail="이 장부는 조회 전용입니다. 등록할 수 없습니다.")

    if payload.account_id:
        account = db.get(Account, payload.account_id)
        if account:
            valid_codes = _get_valid_account_codes(payload.category_name)
            if valid_codes and account.code not in valid_codes:
                raise HTTPException(
                    status_code=400,
                    detail=f"선택한 계정코드({account.code} · {account.name})는 {payload.category_name}에 사용할 수 없습니다."
                )

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
    cat_def = _get_category_def(payload.category_name)
    if not cat_def or not cat_def.get("editable"):
        raise HTTPException(status_code=403, detail="이 장부는 조회 전용입니다. 수정할 수 없습니다.")

    if payload.account_id:
        account = db.get(Account, payload.account_id)
        if account:
            valid_codes = _get_valid_account_codes(payload.category_name)
            if valid_codes and account.code not in valid_codes:
                raise HTTPException(
                    status_code=400,
                    detail=f"선택한 계정코드({account.code} · {account.name})는 {payload.category_name}에 사용할 수 없습니다."
                )

    voucher = db.get(Voucher, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="전표를 찾지 못했습니다.")

    # Prevent editing offering-sourced entries
    if voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK:
        raise HTTPException(status_code=403, detail="헌금현황에서 가져온 수입 데이터는 수정할 수 없습니다. 헌금현황 화면에서 수정해주세요.")

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


@router.delete("/entries/{voucher_id}")
def delete_entry(voucher_id: int, db: Session = Depends(get_db)):
    voucher = db.get(Voucher, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="전표를 찾지 못했습니다.")

    # Prevent deleting offering-sourced entries
    if voucher.source_workbook == WEEKLY_SOURCE_WORKBOOK:
        raise HTTPException(status_code=403, detail="헌금현황에서 가져온 수입 데이터는 삭제할 수 없습니다. 헌금현황 화면에서 삭제해주세요.")

    # Check if the category is editable
    cat_name = voucher.source_sheet or (voucher.fund.name if voucher.fund else None)
    cat_def = _get_category_def(cat_name) if cat_name else None
    if cat_def and not cat_def.get("editable"):
        raise HTTPException(status_code=403, detail="이 장부는 조회 전용입니다. 삭제할 수 없습니다.")

    db.delete(voucher)
    db.commit()
    return {"message": "삭제 완료"}


# ---------------------------------------------------------------------------
# Account code management (unchanged)
# ---------------------------------------------------------------------------

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


@router.delete("/account-codes/{account_id}")
def delete_account_code(account_id: int, db: Session = Depends(get_db)):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="회계코드를 찾지 못했습니다.")
    # Check if used in vouchers
    in_use = db.scalar(select(Voucher).where(Voucher.account_id == account_id))
    if in_use:
        raise HTTPException(status_code=400, detail="이미 전표에 사용 중인 계정코드입니다. 삭제할 수 없습니다.")
    db.delete(account)
    db.commit()
    return {"message": "삭제 완료"}



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
