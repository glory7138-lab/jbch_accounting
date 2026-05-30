from collections import defaultdict
from decimal import Decimal
import calendar
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Voucher, Member



def build_dashboard_summary(db: Session, year: int | None = None) -> dict:
    stmt_vouchers = (
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund), joinedload(Voucher.member), joinedload(Voucher.lines))
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
    )

    stmt_totals = select(
        func.coalesce(func.sum(Voucher.amount).filter(Voucher.entry_type == "income"), 0),
        func.coalesce(func.sum(Voucher.amount).filter(Voucher.entry_type == "expense"), 0),
    )

    stmt_monthly = select(Voucher)

    stmt_account = (
        select(
            Account.name, 
            Account.middle_category, 
            Account.report_category, 
            func.coalesce(func.sum(Voucher.amount), 0)
        )
        .join(Voucher, Voucher.account_id == Account.id, isouter=True)
    )

    if year:
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)
        stmt_vouchers = stmt_vouchers.where(Voucher.voucher_date >= start_date, Voucher.voucher_date <= end_date)
        stmt_totals = stmt_totals.where(Voucher.voucher_date >= start_date, Voucher.voucher_date <= end_date)
        stmt_monthly = stmt_monthly.where(Voucher.voucher_date >= start_date, Voucher.voucher_date <= end_date)
        stmt_account = stmt_account.where(Voucher.voucher_date >= start_date, Voucher.voucher_date <= end_date)

    vouchers = db.scalars(stmt_vouchers.limit(10)).unique().all()
    totals = db.execute(stmt_totals).one()

    monthly_income = defaultdict(Decimal)
    monthly_expense = defaultdict(Decimal)
    for voucher in db.scalars(stmt_monthly).all():
        bucket = voucher.voucher_date.strftime("%Y-%m")
        if voucher.entry_type == "income":
            monthly_income[bucket] += voucher.amount
        else:
            monthly_expense[bucket] += voucher.amount

    account_rows = db.execute(
        stmt_account
        .group_by(Account.name, Account.middle_category, Account.report_category)
        .order_by(func.coalesce(func.sum(Voucher.amount), 0).desc())
        .limit(8)
    ).all()

    total_income = Decimal(totals[0])
    total_expense = Decimal(totals[1])
    return {
        "total_income": total_income,
        "total_expense": total_expense,
        "net_income": total_income - total_expense,
        "monthly_income": [{"month": k, "amount": monthly_income[k]} for k in sorted(monthly_income)],
        "monthly_expense": [{"month": k, "amount": monthly_expense[k]} for k in sorted(monthly_expense)],
        "by_account": [
            {
                "account": f"{row[0]} ({row[1]} > {row[2]})" if row[1] and row[2] else (f"{row[0]} ({row[2]})" if row[2] else (row[0] or "미분류")),
                "amount": row[3]
            } 
            for row in account_rows
        ],
        "recent_vouchers": vouchers,
    }


def build_offerings_dashboard(
    db: Session,
    start_ym: str | None = None,
    end_ym: str | None = None,
    department: str | None = None,
    account_id: int | None = None,
) -> dict:
    stmt = select(Voucher).join(Voucher.account).outerjoin(Voucher.member).where(Voucher.entry_type == "income")
    
    if start_ym:
        try:
            year, month = map(int, start_ym.split("-"))
            start_date = date(year, month, 1)
            stmt = stmt.where(Voucher.voucher_date >= start_date)
        except ValueError:
            pass
            
    if end_ym:
        try:
            year, month = map(int, end_ym.split("-"))
            _, last_day = calendar.monthrange(year, month)
            end_date = date(year, month, last_day)
            stmt = stmt.where(Voucher.voucher_date <= end_date)
        except ValueError:
            pass
            
    if account_id:
        stmt = stmt.where(Voucher.account_id == account_id)
        
    if department:
        if department == "미지정" or department == "없음":
            stmt = stmt.where((Member.department_name == None) | (Voucher.member_id == None))
        else:
            stmt = stmt.where(Member.department_name == department)
            
    # 모든 계정과목의 한글명 중복 개수 파악
    accounts = db.scalars(select(Account)).all()
    name_counts = defaultdict(int)
    for a in accounts:
        name_counts[a.name] += 1

    account_display_names = {}
    for a in accounts:
        if name_counts[a.name] > 1:
            details = []
            if a.middle_category:
                details.append(a.middle_category)
            if a.report_category:
                details.append(a.report_category)
            
            if details:
                detail_str = " > ".join(details)
                account_display_names[a.id] = f"{a.name} ({detail_str})"
            else:
                account_display_names[a.id] = f"{a.name} ({a.code})"
        else:
            account_display_names[a.id] = a.name

    vouchers = db.scalars(stmt.options(joinedload(Voucher.account), joinedload(Voucher.member))).unique().all()
    
    total_amount = Decimal(0)
    total_count = 0
    participants_set = set()
    
    account_amounts = defaultdict(Decimal)
    account_counts = defaultdict(int)
    account_names = {}
    
    dept_amounts = defaultdict(Decimal)
    dept_counts = defaultdict(int)
    
    monthly_data = defaultdict(lambda: {"amounts": defaultdict(Decimal), "participants": set(), "count": 0})
    yearly_data = defaultdict(lambda: {"amounts": defaultdict(Decimal), "participants": set(), "count": 0})
    
    range_counts = {
        "1만원 미만": {"count": 0, "amount": Decimal(0)},
        "1만원 이상 ~ 5만원 미만": {"count": 0, "amount": Decimal(0)},
        "5만원 이상 ~ 10만원 미만": {"count": 0, "amount": Decimal(0)},
        "10만원 이상 ~ 50만원 미만": {"count": 0, "amount": Decimal(0)},
        "50만원 이상": {"count": 0, "amount": Decimal(0)},
    }
    
    for v in vouchers:
        amt = v.amount
        total_amount += amt
        total_count += 1
        
        p_key = f"M_{v.member_id}" if v.member_id else f"C_{v.counterparty or 'Unknown'}"
        participants_set.add(p_key)
        
        acc_id = v.account_id or 0
        acc_name = account_display_names.get(acc_id, "미지정")
        account_amounts[acc_id] += amt
        account_counts[acc_id] += 1
        account_names[acc_id] = acc_name
        
        dept_name = v.member.department_name if (v.member and v.member.department_name) else "미지정"
        dept_amounts[dept_name] += amt
        dept_counts[dept_name] += 1
        
        m_bucket = v.voucher_date.strftime("%Y-%m")
        y_bucket = v.voucher_date.strftime("%Y")
        
        monthly_data[m_bucket]["amounts"][acc_name] += amt
        monthly_data[m_bucket]["participants"].add(p_key)
        monthly_data[m_bucket]["count"] += 1
        
        yearly_data[y_bucket]["amounts"][acc_name] += amt
        yearly_data[y_bucket]["participants"].add(p_key)
        yearly_data[y_bucket]["count"] += 1
        
        if amt < 10000:
            range_counts["1만원 미만"]["count"] += 1
            range_counts["1만원 미만"]["amount"] += amt
        elif amt < 50000:
            range_counts["1만원 이상 ~ 5만원 미만"]["count"] += 1
            range_counts["1만원 이상 ~ 5만원 미만"]["amount"] += amt
        elif amt < 100000:
            range_counts["5만원 이상 ~ 10만원 미만"]["count"] += 1
            range_counts["5만원 이상 ~ 10만원 미만"]["amount"] += amt
        elif amt < 500000:
            range_counts["10만원 이상 ~ 50만원 미만"]["count"] += 1
            range_counts["10만원 이상 ~ 50만원 미만"]["amount"] += amt
        else:
            range_counts["50만원 이상"]["count"] += 1
            range_counts["50만원 이상"]["amount"] += amt
            
    unique_participants = len(participants_set)
    avg_per_person = (total_amount / unique_participants) if unique_participants > 0 else Decimal(0)
    
    by_account = []
    for acc_id, amt in account_amounts.items():
        by_account.append({
            "account_id": acc_id,
            "account_name": account_names[acc_id],
            "total_amount": amt,
            "total_count": account_counts[acc_id],
            "percentage": float((amt / total_amount * 100)) if total_amount > 0 else 0.0
        })
    by_account.sort(key=lambda x: x["total_amount"], reverse=True)
    
    by_department = []
    for dept_name, amt in dept_amounts.items():
        by_department.append({
            "department_name": dept_name,
            "total_amount": amt,
            "total_count": dept_counts[dept_name],
            "percentage": float((amt / total_amount * 100)) if total_amount > 0 else 0.0
        })
    by_department.sort(key=lambda x: x["total_amount"], reverse=True)
    
    monthly_trends = []
    for m in sorted(monthly_data.keys()):
        m_info = monthly_data[m]
        tot_m_amt = sum(m_info["amounts"].values())
        monthly_trends.append({
            "period": m,
            "amounts": {k: v for k, v in m_info["amounts"].items()},
            "participant_counts": {},
            "total_amount": tot_m_amt,
            "total_participants": len(m_info["participants"]),
            "total_count": m_info["count"]
        })
        
    yearly_trends = []
    for y in sorted(yearly_data.keys()):
        y_info = yearly_data[y]
        tot_y_amt = sum(y_info["amounts"].values())
        yearly_trends.append({
            "period": y,
            "amounts": {k: v for k, v in y_info["amounts"].items()},
            "participant_counts": {},
            "total_amount": tot_y_amt,
            "total_participants": len(y_info["participants"]),
            "total_count": y_info["count"]
        })
        
    by_amount_range = []
    for label, info in range_counts.items():
        by_amount_range.append({
            "range_label": label,
            "total_count": info["count"],
            "total_amount": info["amount"]
        })
        
    return {
        "total_amount": total_amount,
        "total_count": total_count,
        "unique_participants": unique_participants,
        "average_amount_per_person": avg_per_person,
        "by_account": by_account,
        "by_department": by_department,
        "monthly_trends": monthly_trends,
        "yearly_trends": yearly_trends,
        "by_amount_range": by_amount_range
    }

