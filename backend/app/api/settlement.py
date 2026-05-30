"""Settlement (월말결산) API router."""
from __future__ import annotations

from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.settlement_service import (
    build_participation_report,
    build_settlement_form,
    build_weekly_report,
    build_quarterly_report,
)

router = APIRouter(prefix="/settlement", tags=["settlement"])


@router.get("/form")
def settlement_form(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return build_settlement_form(db, year, month)


@router.get("/participation")
def participation(
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
):
    return build_participation_report(db, year)


@router.get("/weekly-report")
def weekly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    return build_weekly_report(db, year, month)


# ---------------------------------------------------------------------------
# Excel exports
# ---------------------------------------------------------------------------

MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]


@router.get("/form.xlsx")
def export_settlement_form(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    data = build_settlement_form(db, year, month)
    rows = []
    for group in data["groups"]:
        max_len = max(len(group["income_items"]), len(group["expense_items"]))
        for i in range(max_len):
            row = {"계정그룹": group["group_name"] if i == 0 else ""}
            if i < len(group["income_items"]):
                inc = group["income_items"][i]
                row["수입항목"] = inc["name"]
                row["수입_전월"] = inc["prev_month"]
                row["수입_당월"] = inc["current_month"]
            else:
                row["수입항목"] = ""
                row["수입_전월"] = ""
                row["수입_당월"] = ""
            if i < len(group["expense_items"]):
                exp = group["expense_items"][i]
                row["지출항목"] = exp["name"]
                row["지출_전월"] = exp["prev_month"]
                row["지출_당월"] = exp["current_month"]
            else:
                row["지출항목"] = ""
                row["지출_전월"] = ""
                row["지출_당월"] = ""
            rows.append(row)
        # Subtotal row
        rows.append({
            "계정그룹": "",
            "수입항목": "수입계",
            "수입_전월": group["income_total"]["prev_month"],
            "수입_당월": group["income_total"]["current_month"],
            "지출항목": "지출계",
            "지출_전월": group["expense_total"]["prev_month"],
            "지출_당월": group["expense_total"]["current_month"],
        })
        rows.append({
            "계정그룹": "",
            "수입항목": "전월금",
            "수입_전월": "",
            "수입_당월": group["prev_balance"],
            "지출항목": "이월금",
            "지출_전월": "",
            "지출_당월": group["carry_forward"],
        })

    df = pd.DataFrame(rows)
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="결산양식")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="settlement-form-{year}-{month:02d}.xlsx"'},
    )


@router.get("/participation.xlsx")
def export_participation(
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
):
    data = build_participation_report(db, year)

    # Sheet 1: offering participation
    rows = []
    for offering in data["offering_participation"]:
        count_row = {"헌금항목": offering["offering_name"], "구분": "인원", f"{year-1}년12월": offering["prev_december"]["count"]}
        amount_row = {"헌금항목": "", "구분": "금액", f"{year-1}년12월": offering["prev_december"]["amount"]}
        for md in offering["monthly"]:
            count_row[MONTH_NAMES[md["month"] - 1]] = md["count"]
            amount_row[MONTH_NAMES[md["month"] - 1]] = md["amount"]
        rows.append(count_row)
        rows.append(amount_row)
    df1 = pd.DataFrame(rows)

    # Sheet 2: major expenses
    exp_rows = []
    for expense in data["major_expenses"]:
        row = {"항목": expense["expense_name"]}
        for md in expense["monthly"]:
            row[MONTH_NAMES[md["month"] - 1]] = md["amount"]
        row["합계"] = expense["total"]
        exp_rows.append(row)
    df2 = pd.DataFrame(exp_rows)

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df1.to_excel(writer, index=False, sheet_name="참여현황")
        df2.to_excel(writer, index=False, sheet_name="주요관리항목지출")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="participation-{year}.xlsx"'},
    )


@router.get("/weekly-report.xlsx")
def export_weekly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    data = build_weekly_report(db, year, month)
    rows = []
    for group in data["groups"]:
        # Income section
        for item in group["income_items"]:
            row = {"계정그룹": group["group_name"], "구분": "수입", "항목": item["name"]}
            for w in range(5):
                row[f"{w+1}주차"] = item["weekly"][w]
            row["누적"] = item["cumulative"]
            row["예산"] = item["budget"]
            row["차이"] = item["difference"]
            rows.append(row)
        # Expense section
        for item in group["expense_items"]:
            row = {"계정그룹": "", "구분": "지출", "항목": item["name"]}
            for w in range(5):
                row[f"{w+1}주차"] = item["weekly"][w]
            row["누적"] = item["cumulative"]
            row["예산"] = item["budget"]
            row["차이"] = item["difference"]
            rows.append(row)

    df = pd.DataFrame(rows)
    if not df.empty:
        cols = ["계정그룹", "구분", "항목", "1주차", "2주차", "3주차", "4주차", "5주차", "누적", "예산", "차이"]
        df = df[cols]
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="주간보고자료")

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="weekly-report-{year}-{month:02d}.xlsx"'},
    )


@router.get("/quarterly")
def get_quarterly_report(
    year: int = Query(..., ge=2000, le=2100),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
):
    return build_quarterly_report(db, year, quarter)


@router.get("/quarterly.xlsx")
def export_quarterly_report(
    year: int = Query(..., ge=2000, le=2100),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
):
    data = build_quarterly_report(db, year, quarter)
    
    # We will build sheets matching the Excel layout
    # Sheet 1: 수지현황
    rows = []
    
    # 1. 수입 내역
    rows.append({"구분": "1. 수입 내역", "상세": "", data["months"][0]: "", data["months"][1]: "", data["months"][2]: "", "분기합계": ""})
    rows.append({"구분": "구 분", "상세": "", data["months"][0]: data["months"][0], data["months"][1]: data["months"][1], data["months"][2]: data["months"][2], "분기합계": "분기합계"})
    
    for item in data["income"]:
        rows.append({
            "구분": "헌금" if item["category"] != "헌금이외의 수입합계" else "헌금이외의 수입합계",
            "상세": item["category"],
            data["months"][0]: item["monthly"][0],
            data["months"][1]: item["monthly"][1],
            data["months"][2]: item["monthly"][2],
            "분기합계": item["total"],
        })
    rows.append({
        "구분": "合 計",
        "상세": "",
        data["months"][0]: data["income_total"][0],
        data["months"][1]: data["income_total"][1],
        data["months"][2]: data["income_total"][2],
        "분기합계": sum(data["income_total"]),
    })
    
    rows.append({}) # Empty spacer row
    
    # 2. 지출 내역
    rows.append({"구분": "2. 지출 내역", "상세": "", data["months"][0]: "", data["months"][1]: "", data["months"][2]: "", "분기합계": ""})
    rows.append({"구분": "구 분", "상세": "", data["months"][0]: data["months"][0], data["months"][1]: data["months"][1], data["months"][2]: data["months"][2], "분기합계": "분기합계"})
    
    for item in data["expense"]:
        rows.append({
            "구분": item["category"],
            "상세": "",
            data["months"][0]: item["monthly"][0],
            data["months"][1]: item["monthly"][1],
            data["months"][2]: item["monthly"][2],
            "분기합계": item["total"],
        })
    rows.append({
        "구분": "合 計",
        "상세": "",
        data["months"][0]: data["expense_total"][0],
        data["months"][1]: data["expense_total"][1],
        data["months"][2]: data["expense_total"][2],
        "분기합계": sum(data["expense_total"]),
    })
    
    rows.append({}) # Spacer
    
    # 3. 교회운영비 내역
    rows.append({"구분": "3. 교회운영비 내역", "상세": "", data["months"][0]: "", data["months"][1]: "", data["months"][2]: "", "분기합계": ""})
    rows.append({"구분": "구 분", "상세": "", data["months"][0]: data["months"][0], data["months"][1]: data["months"][1], data["months"][2]: data["months"][2], "분기합계": "분기합계"})
    
    for item in data["operating_expenses"]:
        rows.append({
            "구분": item["category"],
            "상세": "",
            data["months"][0]: item["monthly"][0],
            data["months"][1]: item["monthly"][1],
            data["months"][2]: item["monthly"][2],
            "분기합계": item["total"],
        })
    rows.append({
        "구분": "合 計",
        "상세": "",
        data["months"][0]: data["operating_total"][0],
        data["months"][1]: data["operating_total"][1],
        data["months"][2]: data["operating_total"][2],
        "분기합계": sum(data["operating_total"]),
    })
    
    rows.append({}) # Spacer
    
    # 4. 잔고현황
    rows.append({"구분": "4. 분기말일자 현재 잔고현황", "상세": "", data["months"][0]: "", data["months"][1]: "", data["months"][2]: "", "분기합계": ""})
    rows.append({"구분": "예,적금 및 현금", "상세": "", data["months"][0]: data["ending_balance"], data["months"][1]: "", data["months"][2]: "", "분기합계": ""})

    df = pd.DataFrame(rows)
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=f"{quarter}분기수지현황")
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="quarterly-report-{year}-Q{quarter}.xlsx"'},
    )
