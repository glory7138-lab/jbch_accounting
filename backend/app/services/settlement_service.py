"""Settlement (월말결산) data aggregation service.

Builds three reports from existing voucher/account data:
1. Settlement Form    – 결산양식 (income/expense by account group)
2. Participation      – 참여현황 및 주요관리항목 지출
3. Weekly Report      – 주간보고자료
"""
from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select, and_, or_, extract
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Fund, Member, Voucher

# ---------------------------------------------------------------------------
# Constants – account-group definitions matching the Excel settlement form
# ---------------------------------------------------------------------------

ACCOUNT_GROUPS = [
    {
        "key": "일반계정",
        "income_accounts": [
            "십일조", "주일헌금", "집회헌금", "감사헌금",
            "세계선교분담금", "기타헌금", "기타수입", "예금이자",
            "건축 대여금 회수", "차입금",
        ],
        "expense_accounts": [
            "총회비", "세계선교분담금", "주일말씀", "전도집회비",
            "미디어선교회비", "공과금", "운영비", "사무&비품",
            "차량유지비", "시설&운영관리비", "타교회헌금",
            "부서지원비", "기타비용", "대여금",
        ],
        "fund_names": ["일반계정"],
    },
    {
        "key": "교회학교",
        "income_accounts": ["후원회비", "차입금"],
        "expense_accounts": ["교회학교후원비", "교회학교권역집회"],
        "fund_names": ["교회학교후원회비"],
    },
    {
        "key": "건축계정",
        "income_accounts": [
            "건축헌금", "예금이자", "기타(반환금)", "승강기 헌금",
        ],
        "expense_accounts": [
            "원금상환", "대출이자", "기타비용", "승강기",
        ],
        "fund_names": ["건축계정"],
    },
    {
        "key": "사랑",
        "income_accounts": ["사랑의헌금", "예금이자", "기타수입"],
        "expense_accounts": ["전도지원비", "경조사비", "기타비용"],
        "fund_names": ["사랑의헌금", "사랑"],
    },
    {
        "key": "선교비",
        "income_accounts": ["선교회비", "세계 선교회비"],
        "expense_accounts": ["선교회비", "세계 선교회비"],
        "fund_names": ["선교회비", "선교비"],
    },
    {
        "key": "해외후원",
        "income_accounts": ["해외후원참여헌금", "필리핀퀘존권역", "기타(특별헌금)"],
        "expense_accounts": ["필리핀퀘존권역", "아르헨티나", "기타"],
        "fund_names": ["해외후원"],
    },
    {
        "key": "국내선교",
        "income_accounts": ["카페수익금", "기타(이자등)"],
        "expense_accounts": ["국내 선교비", "기타비용"],
        "fund_names": ["국내선교"],
    },
]

# Main offering types for participation tracking
OFFERING_TYPES = [
    "십일조", "주일헌금", "세계선교분담금",
    "교회학교후원회비", "건축헌금", "사랑의헌금",
    "선교회비", "세계선교회비",
]

BUDGET_MAP = {
    "income": {
        "십일조": 25000000,
        "주일헌금": 2056667,
        "집회헌금": 887500,
        "감사헌금": 735833,
        "세계선교분담금": 1346667,
        "기타헌금": 1250000,
        "후원회비": 786667,
        "교회학교후원회비": 786667,
        "건축헌금": 4766667,
        "회별헌금": 0,
        "승강기헌금": 416667,
        "사랑의헌금": 305000,
        "선교회비": 608333,
        "세계선교회비": 933333,
    },
    "expense": {
        "총회비": 5500000,
        "세계선교분담금": 2800000,
        "주일말씀": 525480,
        "전도집회비": 830833,
        "미디어선교회비": 200000,
        "미디어 선교회비": 200000,
        "공과금": 2212417,
        "운영비": 6609167,
        "사무&비품": 531417,
        "차량유지비": 1368417,
        "시설&운영관리비": 5458614,
        "타교회헌금": 575000,
        "부서지원비": 916667,
        "기타비용": 2066667,
        "기타비용1": 2066667,
        "교회학교후원비": 1031667,
        "교회학교 후원비": 1031667,
        "원금상환": 4766667,
        "원 금 상 환": 4766667,
        "대출이자": 600000,
        "대 출 이 자": 600000,
        "전도지원비": 208333,
        "경조사비": 235000,
        "경 조 사 비": 235000,
        "선교회비": 608333,
        "세계선교회비": 933333,
        "국내 선교비": 575000,
        "국내선교비": 575000,
    }
}


def _normalize(name: str) -> str:
    """Strip whitespace/special chars for fuzzy matching."""
    return name.replace(" ", "").replace("\u3000", "")


def _get_budget_amount(entry_type: str, item_name: str) -> float:
    norm_name = _normalize(item_name)
    sub_map = BUDGET_MAP.get(entry_type, {})
    for k, v in sub_map.items():
        if _normalize(k) == norm_name:
            return float(v)
    return 0.0



def _match_account_name(account_name: str, target_list: list[str]) -> str | None:
    """Fuzzy-match an account name against a target list."""
    norm = _normalize(account_name)
    for target in target_list:
        if _normalize(target) in norm or norm in _normalize(target):
            return target
    return None


def _period_bounds(year: int, month: int) -> tuple[date, date]:
    """Return first and last day of a given year-month."""
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _year_bounds(year: int) -> tuple[date, date]:
    """Return first and last day of a year."""
    return date(year, 1, 1), date(year, 12, 31)


def _previous_month(year: int, month: int) -> tuple[int, int]:
    """Return (year, month) of the previous month."""
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _get_vouchers(db: Session, start: date, end: date, fund_names: list[str] | None = None) -> list[Voucher]:
    """Fetch vouchers in a date range, optionally filtered by fund name."""
    stmt = (
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .where(Voucher.voucher_date >= start, Voucher.voucher_date <= end)
    )
    if fund_names:
        conditions = []
        for fn in fund_names:
            conditions.append(Voucher.fund_name == fn)
            conditions.append(Voucher.fund.has(Fund.name == fn))
            conditions.append(Voucher.source_sheet == fn)
        stmt = stmt.where(or_(*conditions))
    return list(db.scalars(stmt).unique().all())


# ---------------------------------------------------------------------------
# 1. Settlement Form (결산양식)
# ---------------------------------------------------------------------------

def build_settlement_form(db: Session, year: int, month: int) -> dict:
    """Build the settlement form data for a given year/month."""
    curr_start, curr_end = _period_bounds(year, month)
    prev_year, prev_month = _previous_month(year, month)
    prev_start, prev_end = _period_bounds(prev_year, prev_month)

    # We also need cumulative data before current month for carry-forward balance
    year_start = date(year, 1, 1)
    before_curr = date(year, month, 1)

    groups = []
    grand_income_prev = Decimal(0)
    grand_income_curr = Decimal(0)
    grand_expense_prev = Decimal(0)
    grand_expense_curr = Decimal(0)

    for group_def in ACCOUNT_GROUPS:
        fund_names = group_def["fund_names"]

        curr_vouchers = _get_vouchers(db, curr_start, curr_end, fund_names)
        prev_vouchers = _get_vouchers(db, prev_start, prev_end, fund_names)

        # Aggregate income items
        income_items = []
        income_prev_total = Decimal(0)
        income_curr_total = Decimal(0)
        for item_name in group_def["income_accounts"]:
            prev_amt = sum(
                (Decimal(str(v.amount or 0)) for v in prev_vouchers
                 if v.entry_type == "income" and v.account and _match_account_name(v.account.name, [item_name])),
                Decimal(0),
            )
            curr_amt = sum(
                (Decimal(str(v.amount or 0)) for v in curr_vouchers
                 if v.entry_type == "income" and v.account and _match_account_name(v.account.name, [item_name])),
                Decimal(0),
            )
            income_items.append({"name": item_name, "prev_month": float(prev_amt), "current_month": float(curr_amt)})
            income_prev_total += prev_amt
            income_curr_total += curr_amt

        # Also count income vouchers without specific account match
        matched_income_prev = sum(i["prev_month"] for i in income_items)
        matched_income_curr = sum(i["current_month"] for i in income_items)
        unmatched_prev = sum(
            (Decimal(str(v.amount or 0)) for v in prev_vouchers if v.entry_type == "income"),
            Decimal(0),
        ) - Decimal(str(matched_income_prev))
        unmatched_curr = sum(
            (Decimal(str(v.amount or 0)) for v in curr_vouchers if v.entry_type == "income"),
            Decimal(0),
        ) - Decimal(str(matched_income_curr))
        if unmatched_prev > 0 or unmatched_curr > 0:
            income_items.append({"name": "기타", "prev_month": float(unmatched_prev), "current_month": float(unmatched_curr)})
            income_prev_total += unmatched_prev
            income_curr_total += unmatched_curr

        # Aggregate expense items
        expense_items = []
        expense_prev_total = Decimal(0)
        expense_curr_total = Decimal(0)
        for item_name in group_def["expense_accounts"]:
            prev_amt = sum(
                (Decimal(str(v.amount or 0)) for v in prev_vouchers
                 if v.entry_type == "expense" and v.account and _match_account_name(v.account.name, [item_name])),
                Decimal(0),
            )
            curr_amt = sum(
                (Decimal(str(v.amount or 0)) for v in curr_vouchers
                 if v.entry_type == "expense" and v.account and _match_account_name(v.account.name, [item_name])),
                Decimal(0),
            )
            expense_items.append({"name": item_name, "prev_month": float(prev_amt), "current_month": float(curr_amt)})
            expense_prev_total += prev_amt
            expense_curr_total += curr_amt

        # Unmatched expenses
        matched_expense_prev = sum(e["prev_month"] for e in expense_items)
        matched_expense_curr = sum(e["current_month"] for e in expense_items)
        unmatched_exp_prev = sum(
            (Decimal(str(v.amount or 0)) for v in prev_vouchers if v.entry_type == "expense"),
            Decimal(0),
        ) - Decimal(str(matched_expense_prev))
        unmatched_exp_curr = sum(
            (Decimal(str(v.amount or 0)) for v in curr_vouchers if v.entry_type == "expense"),
            Decimal(0),
        ) - Decimal(str(matched_expense_curr))
        if unmatched_exp_prev > 0 or unmatched_exp_curr > 0:
            expense_items.append({"name": "기타", "prev_month": float(unmatched_exp_prev), "current_month": float(unmatched_exp_curr)})
            expense_prev_total += unmatched_exp_prev
            expense_curr_total += unmatched_exp_curr

        # Calculate carry-forward (previous months cumulative balance)
        prior_vouchers = _get_vouchers(db, year_start, before_curr - __import__('datetime').timedelta(days=1), fund_names) if before_curr > year_start else []
        prior_income = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "income"), Decimal(0))
        prior_expense = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "expense"), Decimal(0))
        prev_balance = float(prior_income - prior_expense)
        carry_forward = float(prior_income + income_curr_total - prior_expense - expense_curr_total)

        groups.append({
            "group_name": group_def["key"],
            "income_items": income_items,
            "expense_items": expense_items,
            "income_total": {"prev_month": float(income_prev_total), "current_month": float(income_curr_total)},
            "expense_total": {"prev_month": float(expense_prev_total), "current_month": float(expense_curr_total)},
            "prev_balance": prev_balance,
            "carry_forward": carry_forward,
        })

        grand_income_prev += income_prev_total
        grand_income_curr += income_curr_total
        grand_expense_prev += expense_prev_total
        grand_expense_curr += expense_curr_total

    return {
        "year": year,
        "month": month,
        "groups": groups,
        "grand_total": {
            "income_prev": float(grand_income_prev),
            "income_curr": float(grand_income_curr),
            "expense_prev": float(grand_expense_prev),
            "expense_curr": float(grand_expense_curr),
            "net_prev": float(grand_income_prev - grand_expense_prev),
            "net_curr": float(grand_income_curr - grand_expense_curr),
        },
    }


# ---------------------------------------------------------------------------
# 2. Participation Report (참여현황 및 주요관리항목 지출)
# ---------------------------------------------------------------------------

def build_participation_report(db: Session, year: int) -> dict:
    """Build monthly participation and major expense tracking."""
    year_start, year_end = _year_bounds(year)
    prev_year_start, prev_year_end = _year_bounds(year - 1)

    # Get all vouchers for the year
    all_vouchers = _get_vouchers(db, year_start, year_end)
    # Also get December of previous year for comparison
    prev_dec_start, prev_dec_end = _period_bounds(year - 1, 12)
    prev_dec_vouchers = _get_vouchers(db, prev_dec_start, prev_dec_end)

    # Build monthly participation data for each offering type
    offering_participation = []
    for offering_name in OFFERING_TYPES:
        monthly_data = []
        for m in range(1, 13):
            m_start, m_end = _period_bounds(year, m)
            month_vouchers = [
                v for v in all_vouchers
                if m_start <= v.voucher_date <= m_end
                and v.entry_type == "income"
                and v.account
                and _match_account_name(v.account.name, [offering_name])
            ]
            # Count unique participants (by member_id)
            participants = set()
            total_amount = Decimal(0)
            for v in month_vouchers:
                if v.member_id:
                    participants.add(v.member_id)
                total_amount += Decimal(str(v.amount or 0))
            monthly_data.append({
                "month": m,
                "count": len(participants),
                "amount": float(total_amount),
            })

        # Previous December
        prev_dec_data = [
            v for v in prev_dec_vouchers
            if v.entry_type == "income"
            and v.account
            and _match_account_name(v.account.name, [offering_name])
        ]
        prev_dec_participants = set()
        prev_dec_amount = Decimal(0)
        for v in prev_dec_data:
            if v.member_id:
                prev_dec_participants.add(v.member_id)
            prev_dec_amount += Decimal(str(v.amount or 0))

        offering_participation.append({
            "offering_name": offering_name,
            "prev_december": {
                "count": len(prev_dec_participants),
                "amount": float(prev_dec_amount),
            },
            "monthly": monthly_data,
        })

    # Build major expense items tracking
    major_expense_categories = ["전기요금", "공과금", "운영비", "차량유지비"]
    major_expenses = []
    for expense_name in major_expense_categories:
        monthly_data = []
        for m in range(1, 13):
            m_start, m_end = _period_bounds(year, m)
            month_amount = sum(
                (Decimal(str(v.amount or 0)) for v in all_vouchers
                 if m_start <= v.voucher_date <= m_end
                 and v.entry_type == "expense"
                 and v.account
                 and _match_account_name(v.account.name, [expense_name])),
                Decimal(0),
            )
            monthly_data.append({"month": m, "amount": float(month_amount)})
        major_expenses.append({
            "expense_name": expense_name,
            "monthly": monthly_data,
            "total": float(sum(Decimal(str(d["amount"])) for d in monthly_data)),
        })

    return {
        "year": year,
        "offering_participation": offering_participation,
        "major_expenses": major_expenses,
    }


# ---------------------------------------------------------------------------
# 3. Weekly Report (주간보고자료)
# ---------------------------------------------------------------------------

def _week_ranges(year: int, month: int) -> list[tuple[date, date]]:
    """Split a month into week ranges (Mon–Sun buckets, max 5 weeks)."""
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    weeks = []
    current = first_day
    while current <= last_day and len(weeks) < 5:
        # If it's the 5th week, map it all the way to the end of the month
        if len(weeks) == 4:
            week_end = last_day
        else:
            days_until_sunday = 6 - current.weekday()  # weekday(): Mon=0, Sun=6
            week_end = min(current + __import__('datetime').timedelta(days=days_until_sunday), last_day)
        weeks.append((current, week_end))
        current = week_end + __import__('datetime').timedelta(days=1)
    return weeks


def build_weekly_report(db: Session, year: int, month: int) -> dict:
    """Build weekly settlement report for a given year/month."""
    curr_start, curr_end = _period_bounds(year, month)
    weeks = _week_ranges(year, month)

    # Get budget data (annual budget / 12 as monthly)
    # Budget is not stored in DB, so we'll use 0 as placeholder
    # The actual budget would need to be configured separately

    groups = []
    grand_totals = {
        "income_weekly": [Decimal(0)] * 5,
        "expense_weekly": [Decimal(0)] * 5,
        "income_cumulative": Decimal(0),
        "expense_cumulative": Decimal(0),
    }

    # Year-to-date before current month for balance
    year_start = date(year, 1, 1)
    before_curr = date(year, month, 1)

    for group_def in ACCOUNT_GROUPS:
        fund_names = group_def["fund_names"]
        all_month_vouchers = _get_vouchers(db, curr_start, curr_end, fund_names)
        prior_vouchers = _get_vouchers(db, year_start, before_curr - __import__('datetime').timedelta(days=1), fund_names) if before_curr > year_start else []

        # Income by week
        income_items = []
        income_weekly_totals = [Decimal(0)] * 5
        income_cumulative = Decimal(0)

        for item_name in group_def["income_accounts"]:
            weekly_amounts = []
            item_cumulative = Decimal(0)
            for w_idx, (w_start, w_end) in enumerate(weeks):
                amt = sum(
                    (Decimal(str(v.amount or 0)) for v in all_month_vouchers
                     if w_start <= v.voucher_date <= w_end
                     and v.entry_type == "income"
                     and v.account
                     and _match_account_name(v.account.name, [item_name])),
                    Decimal(0),
                )
                weekly_amounts.append(float(amt))
                income_weekly_totals[w_idx] += amt
                item_cumulative += amt
            income_cumulative += item_cumulative
            budget_val = _get_budget_amount("income", item_name)
            diff_val = float(item_cumulative) - budget_val
            income_items.append({
                "name": item_name,
                "weekly": weekly_amounts + [0.0] * (5 - len(weekly_amounts)),
                "cumulative": float(item_cumulative),
                "budget": budget_val,
                "difference": diff_val,
            })

        # Expense by week
        expense_items = []
        expense_weekly_totals = [Decimal(0)] * 5
        expense_cumulative = Decimal(0)

        for item_name in group_def["expense_accounts"]:
            weekly_amounts = []
            item_cumulative = Decimal(0)
            for w_idx, (w_start, w_end) in enumerate(weeks):
                amt = sum(
                    (Decimal(str(v.amount or 0)) for v in all_month_vouchers
                     if w_start <= v.voucher_date <= w_end
                     and v.entry_type == "expense"
                     and v.account
                     and _match_account_name(v.account.name, [item_name])),
                    Decimal(0),
                )
                weekly_amounts.append(float(amt))
                expense_weekly_totals[w_idx] += amt
                item_cumulative += amt
            expense_cumulative += item_cumulative
            budget_val = _get_budget_amount("expense", item_name)
            diff_val = budget_val - float(item_cumulative)
            expense_items.append({
                "name": item_name,
                "weekly": weekly_amounts + [0.0] * (5 - len(weekly_amounts)),
                "cumulative": float(item_cumulative),
                "budget": budget_val,
                "difference": diff_val,
            })

        # Prior balance
        prior_income = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "income"), Decimal(0))
        prior_expense = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "expense"), Decimal(0))
        prev_balance = float(prior_income - prior_expense)

        # Account balance per week (cumulative)
        account_balances = []
        running = prior_income - prior_expense
        for w_idx in range(5):
            if w_idx < len(weeks):
                running += income_weekly_totals[w_idx] - expense_weekly_totals[w_idx]
            account_balances.append(float(running))

        # Calculate budget and difference subtotals for this group
        income_budget_total = sum(item["budget"] for item in income_items)
        income_difference_total = float(income_cumulative) - income_budget_total
        expense_budget_total = sum(item["budget"] for item in expense_items)
        expense_difference_total = expense_budget_total - float(expense_cumulative)

        groups.append({
            "group_name": group_def["key"],
            "income_items": income_items,
            "expense_items": expense_items,
            "income_weekly_totals": [float(t) for t in income_weekly_totals],
            "expense_weekly_totals": [float(t) for t in expense_weekly_totals],
            "income_cumulative": float(income_cumulative),
            "expense_cumulative": float(expense_cumulative),
            "income_budget_total": income_budget_total,
            "income_difference_total": income_difference_total,
            "expense_budget_total": expense_budget_total,
            "expense_difference_total": expense_difference_total,
            "prev_balance": prev_balance,
            "account_balances": account_balances,
        })

        for i in range(5):
            grand_totals["income_weekly"][i] += income_weekly_totals[i]
            grand_totals["expense_weekly"][i] += expense_weekly_totals[i]
        grand_totals["income_cumulative"] += income_cumulative
        grand_totals["expense_cumulative"] += expense_cumulative

    # Grand budget and difference totals
    grand_income_budget = sum(g["income_budget_total"] for g in groups)
    grand_income_difference = float(grand_totals["income_cumulative"]) - grand_income_budget
    grand_expense_budget = sum(g["expense_budget_total"] for g in groups)
    grand_expense_difference = grand_expense_budget - float(grand_totals["expense_cumulative"])

    return {
        "year": year,
        "month": month,
        "num_weeks": len(weeks),
        "week_ranges": [
            {"week": i + 1, "start": w[0].isoformat(), "end": w[1].isoformat()}
            for i, w in enumerate(weeks)
        ],
        "groups": groups,
        "grand_totals": {
            "income_weekly": [float(t) for t in grand_totals["income_weekly"]],
            "expense_weekly": [float(t) for t in grand_totals["expense_weekly"]],
            "income_cumulative": float(grand_totals["income_cumulative"]),
            "expense_cumulative": float(grand_totals["expense_cumulative"]),
            "income_budget": grand_income_budget,
            "income_difference": grand_income_difference,
            "expense_budget": grand_expense_budget,
            "expense_difference": grand_expense_difference,
        },
    }


def build_quarterly_report(db: Session, year: int, quarter: int) -> dict:
    """Build quarterly income/expense statement aggregated by month."""
    start_month = (quarter - 1) * 3 + 1
    end_month = quarter * 3

    # Define date range for this quarter
    start_date = date(year, start_month, 1)
    end_date = date(year, end_month, monthrange(year, end_month)[1])

    # Fetch all vouchers for this quarter
    vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account))
        .where(Voucher.voucher_date >= start_date, Voucher.voucher_date <= end_date)
    ).all()

    # Classification lists
    income_categories = [
        "십일조",
        "주일헌금",
        "건축관련헌금",
        "기타헌금",
        "선교회비",
        "세계선교헌금",
        "헌금이외의 수입합계",
    ]

    expense_categories = [
        "교회운영비",
        "지역교회지원",
        "차량 및 부동산 구입",
        "비품구입",
        "채무상환 및 이자",
        "총회송금 - 전도분담금",
        "총회송금 - 퇴직적립금",
        "총회송금 - 선교회비",
        "총회송금 - 세계선교헌금",
        "총회송금 - 세계선교분담금(정기책정분+비정기분)",
        "총회송금 - 해외교회 입당헌금",
        "이외의 기타지출 합계",
    ]

    operating_categories = [
        "교회당 유지관련 시설보수비등",
        "각종 공과금",
        "강사사례",
        "전도인 전도지원금(월정액)",
        "직원급여등",
        "경조사비",
        "교회행사비",
        "사무운영등 기타경비",
    ]

    # Helper function to classify vouchers
    def classify_voucher(name: str, code: str, entry_type: str) -> str:
        name_norm = _normalize(name or "")
        if entry_type == "income":
            if "십일조" in name_norm or code == "11000":
                return "십일조"
            elif "주일헌금" in name_norm or code == "11200":
                return "주일헌금"
            elif "건축" in name_norm or code == "11300":
                return "건축관련헌금"
            elif "선교회비" in name_norm or code == "12000":
                return "선교회비"
            elif "세계선교" in name_norm or code in ("12100", "12200"):
                return "세계선교헌금"
            elif any(k in name_norm for k in ("감사", "집회", "사랑", "기타헌금")) or code in ("11100", "11400", "14000", "11500"):
                return "기타헌금"
            else:
                return "헌금이외의 수입합계"
        else:
            # Check operating expenses first
            if any(k in name_norm for k in ("시설", "보수", "유지관리", "수리", "공사", "소방", "안전")):
                return "교회당 유지관련 시설보수비등"
            elif any(k in name_norm for k in ("공과금", "전기", "수도", "가스", "요금", "세금", "공과")):
                return "각종 공과금"
            elif any(k in name_norm for k in ("강사", "사례", "강사사례")):
                return "강사사례"
            elif any(k in name_norm for k in ("전도지원금", "전도인지원", "지원금(월정", "전도인 전도")):
                return "전도인 전도지원금(월정액)"
            elif any(k in name_norm for k in ("급여", "상여", "인건비", "직원", "보너스")):
                return "직원급여등"
            elif any(k in name_norm for k in ("경조사", "조사", "축의", "조의")):
                return "경조사비"
            elif any(k in name_norm for k in ("행사", "수련회", "대집회", "야외", "체육")):
                return "교회행사비"
            elif any(k in name_norm for k in ("사무", "비품", "기타경비", "도서", "우편", "소모품", "소사")):
                return "사무운영등 기타경비"

            # Check non-operating expenses
            if any(k in name_norm for k in ("지역교회", "타교회", "울릉", "산청", "개척교회")):
                return "지역교회지원"
            elif any(k in name_norm for k in ("차량", "부동산", "토지", "건물", "구입", "할부금")):
                return "차량 및 부동산 구입"
            elif "비품구입" in name_norm:
                return "비품구입"
            elif any(k in name_norm for k in ("채무", "상환", "대출", "이자")):
                return "채무상환 및 이자"
            elif "전도분담" in name_norm or "전도 분담" in name_norm:
                return "총회송금 - 전도분담금"
            elif "퇴직" in name_norm or "퇴직적립" in name_norm:
                return "총회송금 - 퇴직적립금"
            elif "선교회비" in name_norm:
                return "총회송금 - 선교회비"
            elif "세계선교헌금" in name_norm:
                return "총회송금 - 세계선교헌금"
            elif "세계선교분담" in name_norm:
                return "총회송금 - 세계선교분담금(정기책정분+비정기분)"
            elif "해외교회" in name_norm or "입당헌금" in name_norm:
                return "총회송금 - 해외교회 입당헌금"
            else:
                # Default to office operating expenses if not explicitly non-operating
                return "사무운영등 기타경비"

    # Initialize monthly matrices
    # indices: 0 = start_month, 1 = start_month+1, 2 = start_month+2
    income_monthly = {cat: [Decimal(0), Decimal(0), Decimal(0)] for cat in income_categories}
    expense_monthly = {cat: [Decimal(0), Decimal(0), Decimal(0)] for cat in expense_categories}
    operating_monthly = {cat: [Decimal(0), Decimal(0), Decimal(0)] for cat in operating_categories}

    for v in vouchers:
        m = v.voucher_date.month
        m_idx = m - start_month
        if m_idx < 0 or m_idx > 2:
            continue
        
        amount = Decimal(str(v.amount or 0))
        acct_name = v.account.name if v.account else ""
        acct_code = v.account.code if v.account else ""

        category = classify_voucher(acct_name, acct_code, v.entry_type)

        if v.entry_type == "income":
            if category in income_monthly:
                income_monthly[category][m_idx] += amount
        else:
            if category in operating_categories:
                operating_monthly[category][m_idx] += amount
                # Operating expenses also add to the main "교회운영비" line item
                expense_monthly["교회운영비"][m_idx] += amount
            elif category in expense_monthly:
                expense_monthly[category][m_idx] += amount

    # Calculate quarter-end balance (savings & cash)
    # Sum of all income minus expense from beginning of year up to end of this quarter
    year_start = date(year, 1, 1)
    prior_vouchers = db.scalars(
        select(Voucher).where(Voucher.voucher_date >= year_start, Voucher.voucher_date <= end_date)
    ).all()
    
    cumulative_income = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "income"), Decimal(0))
    cumulative_expense = sum((Decimal(str(v.amount or 0)) for v in prior_vouchers if v.entry_type == "expense"), Decimal(0))
    
    # We can assume a base starting balance or just calculate current YTD balance
    # Let's check if there are 2025 vouchers to get accurate balance
    all_time_income = db.scalar(
        select(func.sum(Voucher.amount)).where(Voucher.entry_type == "income", Voucher.voucher_date <= end_date)
    ) or 0
    all_time_expense = db.scalar(
        select(func.sum(Voucher.amount)).where(Voucher.entry_type == "expense", Voucher.voucher_date <= end_date)
    ) or 0
    ending_balance = float(all_time_income - all_time_expense)

    # Format output rows
    income_rows = []
    for cat in income_categories:
        row_vals = [float(val) for val in income_monthly[cat]]
        income_rows.append({
            "category": cat,
            "monthly": row_vals,
            "total": sum(row_vals),
        })

    expense_rows = []
    for cat in expense_categories:
        row_vals = [float(val) for val in expense_monthly[cat]]
        expense_rows.append({
            "category": cat,
            "monthly": row_vals,
            "total": sum(row_vals),
        })

    operating_rows = []
    for cat in operating_categories:
        row_vals = [float(val) for val in operating_monthly[cat]]
        operating_rows.append({
            "category": cat,
            "monthly": row_vals,
            "total": sum(row_vals),
        })

    return {
        "year": year,
        "quarter": quarter,
        "months": [f"{start_month}월", f"{start_month + 1}월", f"{end_month}월"],
        "income": income_rows,
        "expense": expense_rows,
        "operating_expenses": operating_rows,
        "income_total": [sum(x) for x in zip(*(row["monthly"] for row in income_rows))],
        "expense_total": [sum(x) for x in zip(*(row["monthly"] for row in expense_rows))],
        "operating_total": [sum(x) for x in zip(*(row["monthly"] for row in operating_rows))],
        "ending_balance": ending_balance,
    }


