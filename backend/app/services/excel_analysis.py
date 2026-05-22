from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid

from app.models import Account, Fund, ImportBatch, Member

KEYWORDS = {
    "date": ["날짜", "일자", "거래일", "년월일", "입금일자", "date"],
    "description": ["적요", "내역", "내용", "품목", "description", "memo"],
    "income": ["수입", "입금", "입", "차변", "income", "debit", "헌금"],
    "expense": ["지출", "출금", "출", "대변", "expense", "credit"],
    "amount": ["금액", "합계", "잔액", "총액", "amount", "balance"],
    "account": ["계정", "계정과목", "과목", "코드", "account", "회계코드"],
    "category": ["구분", "분류", "관리항목", "category", "type"],
    "note": ["비고", "참고", "remark", "note"],
    "name": ["이름", "성명", "name"],
    "member_no": ["번호", "no", "id"],
}

ACCOUNT_CODE_CANDIDATES = ["회계코드", "계정코드"]
MEMBER_SHEET_CANDIDATES = ["헌금봉투번호", "헌금 봉투 번호", "성도현황번호", "성도 현황 번호", "번호"]
FUND_EXCLUDE_NAMES = {"sheet3", "계정코드", "작성상의 주의사항", "회계결산 표지", "sheet1"}


def normalize(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return "" if text.lower() == "nan" else text


def classify_header(header: str) -> list[str]:
    lowered = normalize(header).lower()
    hits: list[str] = []
    for label, keywords in KEYWORDS.items():
        if any(keyword.lower() in lowered for keyword in keywords):
            hits.append(label)
    return hits


def find_header_row(df: pd.DataFrame) -> int:
    best_idx = 0
    best_score = -1.0
    for idx in range(min(len(df), 12)):
        row = [normalize(v) for v in df.iloc[idx].tolist()]
        non_empty = [v for v in row if v and v.lower() != "nan"]
        if not non_empty:
            continue
        score = 0.0
        for cell in non_empty:
            score += 3 if classify_header(cell) else 0
            score += 1 if len(cell) <= 20 else 0
        score += min(len(non_empty), 12)
        if score > best_score:
            best_idx = idx
            best_score = score
    return best_idx


def load_sheet_frame(path: Path, sheet_name: str) -> tuple[pd.DataFrame, int]:
    raw = pd.read_excel(path, sheet_name=sheet_name, header=None)
    if raw.empty:
        return raw, 0
    header_idx = find_header_row(raw)
    header_row = [normalize(v) for v in raw.iloc[header_idx].tolist()]

    headers: list[str] = []
    seen: Counter[str] = Counter()
    for i, header in enumerate(header_row):
        value = header if header and header.lower() != "nan" else f"unnamed_{i + 1}"
        seen[value] += 1
        if seen[value] > 1:
            value = f"{value}_{seen[value]}"
        headers.append(value)

    data = raw.iloc[header_idx + 1 :].copy()
    data.columns = headers
    data = data.dropna(how="all")
    keep_columns = []
    for col in data.columns:
        if not str(col).startswith("unnamed_") or data[col].notna().any():
            keep_columns.append(col)
    data = data.loc[:, keep_columns]
    return data, header_idx + 1


def analyze_workbook(path: Path) -> dict[str, Any]:
    workbook = load_workbook(path, data_only=True)
    excel = pd.ExcelFile(path)
    result: dict[str, Any] = {"file_name": path.name, "sheet_names": excel.sheet_names, "sheets": []}
    for sheet_name in excel.sheet_names:
        data, header_row_index = load_sheet_frame(path, sheet_name)
        headers = [str(col) for col in data.columns.tolist()]
        sample_rows = []
        for _, row in data.head(5).iterrows():
            sample = {str(k): normalize(v) for k, v in row.items() if normalize(v)}
            if sample:
                sample_rows.append(sample)

        normalized_headers = [{"header": h, "tags": classify_header(h)} for h in headers]
        role_tags = Counter(tag for item in normalized_headers for tag in item["tags"])
        if role_tags["income"] and role_tags["expense"]:
            role_guess = "journal_or_summary"
        elif role_tags["amount"] and role_tags["date"]:
            role_guess = "cash_or_balance"
        elif role_tags["category"] and role_tags["amount"]:
            role_guess = "summary"
        else:
            role_guess = "ledger_like"

        result["sheets"].append(
            {
                "sheet_name": sheet_name,
                "header_row_index": header_row_index,
                "headers": headers,
                "normalized_headers": normalized_headers,
                "sample_rows": sample_rows,
                "non_empty_rows": int(len(data)),
                "merged_ranges": [str(rng) for rng in workbook[sheet_name].merged_cells.ranges][:20],
                "role_guess": role_guess,
            }
        )
    return result


def build_schema_brief(analysis: list[dict[str, Any]]) -> dict[str, Any]:
    files_summary = []
    header_bank: list[str] = []
    for workbook in analysis:
        files_summary.append(
            {
                "file_name": workbook["file_name"],
                "sheet_count": len(workbook["sheet_names"]),
                "sheet_names": workbook["sheet_names"],
            }
        )
        for sheet in workbook["sheets"]:
            header_bank.extend(sheet["headers"])

    inferred_domains = [
        {"table": "funds", "reason": "회계장부 파일에 통합계정, 일반계정, 부서/헌금별 시트가 반복됨"},
        {"table": "accounts", "reason": "계정코드 시트에 회계코드와 관리항목 계층이 존재함"},
        {"table": "members", "reason": "헌금현황 파일에 헌금 봉투 번호 시트가 있어 봉투번호가 사실상 식별키 역할을 함"},
        {"table": "vouchers", "reason": "회계장부 시트들이 날짜, 적요, 입금/지출, 잔액 중심의 거래 원장을 가짐"},
        {"table": "voucher_lines", "reason": "수입/지출과 계정코드가 함께 존재해 다중 분개 확장이 필요함"},
        {"table": "accounting_periods", "reason": "월말결산 양식과 주간보고 자료가 월 단위 마감을 전제로 함"},
        {"table": "import_batches", "reason": "엑셀 파싱 결과를 추적하고 재가져오기 이력을 관리해야 함"},
        {"table": "ai_suggestion_logs", "reason": "적요 기반 계정추천 기록과 개선 피드백이 필요함"},
    ]

    return {
        "files": files_summary,
        "top_headers": sorted(set([header for header in header_bank if header and not header.startswith("unnamed")]))[:80],
        "inferred_domains": inferred_domains,
    }


def _list_workbooks(base_dir: str | Path) -> list[Path]:
    base_path = Path(base_dir)
    return sorted(path for path in base_path.glob("*.xlsx") if not path.name.startswith("~$"))


def analyze_sample_directory(base_dir: str | Path) -> dict[str, Any]:
    workbooks = _list_workbooks(base_dir)
    analysis = [analyze_workbook(path) for path in workbooks]
    return {"files": analysis, "schema_brief": build_schema_brief(analysis)}


def _find_sheet_name(sheet_names: list[str], candidates: list[str]) -> str | None:
    for name in sheet_names:
        lowered = name.replace(" ", "")
        if any(candidate.replace(" ", "") in lowered for candidate in candidates):
            return name
    return None


def _match_column(columns: list[str], keywords: list[str]) -> str | None:
    lowered_map = {col: normalize(col).replace(" ", "").lower() for col in columns}
    for keyword in keywords:
        target = keyword.replace(" ", "").lower()
        for col, lowered in lowered_map.items():
            if target in lowered:
                return col
    return None


def seed_reference_data(db: Session, base_dir: str | Path) -> dict[str, int]:
    workbooks = _list_workbooks(base_dir)
    imported = 0

    for workbook_path in workbooks:
        exists = db.scalar(select(ImportBatch).where(ImportBatch.source_name == workbook_path.name))
        if not exists:
            summary = analyze_workbook(workbook_path)
            db.add(ImportBatch(source_name=workbook_path.name, summary_json=summary))
            imported += 1

    ledger_workbook = next((path for path in workbooks if "회계장부" in path.name), None)
    cash_workbook = next((path for path in workbooks if "현금현황" in path.name or "헌금현황" in path.name), None)

    funds_created = 0
    if ledger_workbook:
        excel = pd.ExcelFile(ledger_workbook)
        for sheet_name in excel.sheet_names:
            normalized_name = sheet_name.strip().lower()
            if normalized_name in FUND_EXCLUDE_NAMES:
                continue
            existing_fund = db.scalar(select(Fund).where(Fund.name == sheet_name))
            if existing_fund:
                continue
            code = re.sub(r"[^0-9A-Za-z가-힣]+", "-", sheet_name).strip("-").lower() or f"fund-{funds_created + 1}"
            db.add(Fund(code=code, name=sheet_name))
            funds_created += 1

    accounts_created = 0
    accounts_updated = 0
    if ledger_workbook:
        excel = pd.ExcelFile(ledger_workbook)
        account_sheet = _find_sheet_name(excel.sheet_names, ACCOUNT_CODE_CANDIDATES)
        if account_sheet:
            data, _ = load_sheet_frame(ledger_workbook, account_sheet)
            columns = [str(c) for c in data.columns]
            code_col = _match_column(columns, ["회계코드", "계정코드"])
            major_col = _match_column(columns, ["대분류관리항목", "대분류"])
            middle_col = _match_column(columns, ["중분류관리항목", "중분류"])
            report_col = _match_column(columns, ["세부계정항목", "세부관리항목", "보고용", "예산안"])
            type_col = _match_column(columns, ["계정유형"])
            finance_col = _match_column(columns, ["재정구분"])
            debit_col = _match_column(columns, ["차변계정", "차변"])
            credit_col = _match_column(columns, ["대변계정", "대변"])
            name_col = middle_col or major_col or report_col
            for _, row in data.iterrows():
                code = normalize(row.get(code_col)) if code_col else ""
                if not code or code.lower() == "nan":
                    continue
                name = normalize(row.get(name_col)) if name_col else code
                account_payload = {
                    "name": name or code,
                    "major_category": normalize(row.get(major_col)) if major_col else None,
                    "middle_category": normalize(row.get(middle_col)) if middle_col else None,
                    "report_category": normalize(row.get(report_col)) if report_col else None,
                    "account_type": normalize(row.get(type_col)) if type_col else None,
                    "finance_category": normalize(row.get(finance_col)) if finance_col else None,
                    "debit_account": normalize(row.get(debit_col)) if debit_col else None,
                    "credit_account": normalize(row.get(credit_col)) if credit_col else None,
                }
                normal_side = None
                if account_payload["debit_account"] and not account_payload["credit_account"]:
                    normal_side = "debit"
                elif account_payload["credit_account"] and not account_payload["debit_account"]:
                    normal_side = "credit"
                account_payload["normal_side"] = normal_side

                existing_account = db.scalar(select(Account).where(Account.code == code))
                if existing_account:
                    changed = False
                    for field, value in account_payload.items():
                        if getattr(existing_account, field) != value:
                            setattr(existing_account, field, value)
                            changed = True
                    if changed:
                        accounts_updated += 1
                    continue

                db.add(Account(code=code, **account_payload))
                accounts_created += 1

    members_created = 0
    if cash_workbook:
        excel = pd.ExcelFile(cash_workbook)
        member_sheet = _find_sheet_name(excel.sheet_names, MEMBER_SHEET_CANDIDATES)
        if member_sheet:
            # 시트명에서 연도 숫자 파싱 (예: "헌금 봉투 번호 (2026)" -> 2026)
            year_match = re.search(r"\d{4}", member_sheet)
            sheet_year = int(year_match.group(0)) if year_match else 2026

            data, _ = load_sheet_frame(cash_workbook, member_sheet)
            columns = [str(c) for c in data.columns]
            no_col = _match_column(columns, ["번호", "no"])
            name_col = _match_column(columns, ["이름", "성명"])
            dept_col = _match_column(columns, ["회", "부서"])
            district_col = _match_column(columns, ["구역"])
            age_col = _match_column(columns, ["나이", "연령", "반"])
            gender_col = _match_column(columns, ["남", "여", "성별", "구분"])
            if name_col:
                for _, row in data.iterrows():
                    name = normalize(row.get(name_col))
                    if not name or name.lower() == "nan":
                        continue
                    member_no = normalize(row.get(no_col)) if no_col else None
                    if not member_no:
                        continue

                    # 이름이 같은 기존 성도의 person_id 조회
                    existing_person_id = db.scalar(
                        select(Member.person_id)
                        .where(Member.name == name)
                        .limit(1)
                    )
                    
                    if existing_person_id:
                        person_id = existing_person_id
                    else:
                        person_id = f"P-{uuid.uuid4().hex[:8].upper()}"

                    member_payload = {
                        "name": name,
                        "department_name": normalize(row.get(dept_col)) if dept_col else None,
                        "district_name": normalize(row.get(district_col)) if district_col else None,
                        "gender_or_section": normalize(row.get(gender_col)) if gender_col else None,
                        "age_or_class": normalize(row.get(age_col)) if age_col else None,
                        "source_sheet": member_sheet,
                    }

                    # 해당 연도에 이 봉투번호를 사용하는 멤버가 있는지 확인
                    exists = db.scalar(
                        select(Member)
                        .where(Member.year == sheet_year, Member.member_no == member_no)
                    )
                    if exists:
                        # 해당 연도 레코드 업데이트
                        exists.person_id = person_id
                        for field, value in member_payload.items():
                            if getattr(exists, field) != value:
                                setattr(exists, field, value)
                        continue

                    db.add(
                        Member(
                            person_id=person_id,
                            year=sheet_year,
                            member_no=member_no,
                            **member_payload,
                        )
                    )
                    members_created += 1

    db.commit()
    return {
        "import_batches": imported,
        "funds": funds_created,
        "accounts": accounts_created,
        "accounts_updated": accounts_updated,
        "members": members_created,
    }
