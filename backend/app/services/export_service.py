from io import BytesIO

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Voucher


EXPORT_COLUMNS = [
    "전표번호",
    "거래일자",
    "유형",
    "계정과목",
    "기금",
    "적요",
    "금액",
    "거래처",
    "비고",
]


def build_voucher_rows(db: Session) -> list[dict]:
    vouchers = db.scalars(
        select(Voucher)
        .options(joinedload(Voucher.account), joinedload(Voucher.fund))
        .order_by(Voucher.voucher_date.asc(), Voucher.id.asc())
    ).all()
    rows = []
    for voucher in vouchers:
        rows.append(
            {
                "전표번호": voucher.voucher_no,
                "거래일자": voucher.voucher_date.isoformat(),
                "유형": "수입" if voucher.entry_type == "income" else "지출",
                "계정과목": voucher.account.name if voucher.account else "",
                "기금": voucher.fund.name if voucher.fund else "",
                "적요": voucher.description,
                "금액": float(voucher.amount),
                "거래처": voucher.counterparty or "",
                "비고": voucher.note or "",
            }
        )
    return rows


def export_vouchers_to_excel(db: Session) -> bytes:
    rows = build_voucher_rows(db)
    df = pd.DataFrame(rows, columns=EXPORT_COLUMNS)
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="전표내역")
    return buffer.getvalue()


def export_vouchers_to_markdown(db: Session) -> str:
    rows = build_voucher_rows(db)
    if not rows:
        return "# 전표 내역\n\n등록된 전표가 없습니다.\n"
    df = pd.DataFrame(rows, columns=EXPORT_COLUMNS)
    return "# 전표 내역\n\n" + df.to_markdown(index=False)
