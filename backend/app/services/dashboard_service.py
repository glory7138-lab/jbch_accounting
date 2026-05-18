from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Account, Voucher


def build_dashboard_summary(db: Session) -> dict:
    vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund), joinedload(Voucher.member), joinedload(Voucher.lines))
        .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
        .limit(10)
    ).unique().all()

    totals = db.execute(
        select(
            func.coalesce(func.sum(Voucher.amount).filter(Voucher.entry_type == "income"), 0),
            func.coalesce(func.sum(Voucher.amount).filter(Voucher.entry_type == "expense"), 0),
        )
    ).one()

    monthly_income = defaultdict(Decimal)
    monthly_expense = defaultdict(Decimal)
    for voucher in db.scalars(select(Voucher)).all():
        bucket = voucher.voucher_date.strftime("%Y-%m")
        if voucher.entry_type == "income":
            monthly_income[bucket] += voucher.amount
        else:
            monthly_expense[bucket] += voucher.amount

    account_rows = db.execute(
        select(Account.name, func.coalesce(func.sum(Voucher.amount), 0))
        .join(Voucher, Voucher.account_id == Account.id, isouter=True)
        .group_by(Account.name)
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
        "by_account": [{"account": row[0] or "미분류", "amount": row[1]} for row in account_rows],
        "recent_vouchers": vouchers,
    }
