from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class FundRead(BaseModel):
    id: int
    code: str
    name: str

    model_config = {"from_attributes": True}


class AccountRead(BaseModel):
    id: int
    code: str
    name: str
    major_category: str | None = None
    middle_category: str | None = None
    report_category: str | None = None
    account_type: str | None = None
    finance_category: str | None = None

    model_config = {"from_attributes": True}


class MemberRead(BaseModel):
    id: int
    member_no: str | None = None
    name: str
    department_name: str | None = None
    district_name: str | None = None
    gender_or_section: str | None = None
    age_or_class: str | None = None
    source_sheet: str | None = None

    model_config = {"from_attributes": True}


class MemberLookupResponse(BaseModel):
    found: bool
    lookup_key: str
    member: MemberRead | None = None
    found_by: str | None = None
    message: str | None = None


class VoucherLineCreate(BaseModel):
    account_id: int | None = None
    fund_id: int | None = None
    debit: Decimal = Field(default=0)
    credit: Decimal = Field(default=0)
    description: str | None = None
    note: str | None = None


class VoucherCreate(BaseModel):
    voucher_date: date
    entry_type: str
    description: str
    amount: Decimal
    fund_id: int | None = None
    fund_name: str | None = None
    account_id: int | None = None
    member_id: int | None = None
    counterparty: str | None = None
    note: str | None = None
    source_workbook: str | None = None
    source_sheet: str | None = None
    lines: list[VoucherLineCreate] = []


class VoucherUpdate(BaseModel):
    voucher_date: date | None = None
    entry_type: str | None = None
    description: str | None = None
    amount: Decimal | None = None
    fund_id: int | None = None
    fund_name: str | None = None
    account_id: int | None = None
    member_id: int | None = None
    counterparty: str | None = None
    note: str | None = None


class WeeklyOfferingCreate(BaseModel):
    voucher_date: date
    month: int | None = None
    envelope_no: str | None = None
    member_id: int | None = None
    member_name: str | None = None
    department_name: str | None = None
    district_name: str | None = None
    is_transfer: bool = False
    note: str | None = None
    offerings: dict[str, Decimal] = Field(default_factory=dict)


class WeeklyOfferingBatchCreate(BaseModel):
    rows: list[WeeklyOfferingCreate] = Field(default_factory=list)


class WeeklyOfferingResponse(BaseModel):
    created_count: int
    total_amount: Decimal
    cash_total: Decimal
    voucher_ids: list[int] = []
    voucher_nos: list[str] = []


class VoucherLineRead(BaseModel):
    id: int
    line_no: int
    debit: Decimal
    credit: Decimal
    description: str | None = None
    note: str | None = None
    account: AccountRead | None = None
    fund: FundRead | None = None

    model_config = {"from_attributes": True}


class VoucherRead(BaseModel):
    id: int
    voucher_no: str
    voucher_date: date
    entry_type: str
    description: str
    amount: Decimal
    fund_name: str | None = None
    counterparty: str | None = None
    note: str | None = None
    source_workbook: str | None = None
    source_sheet: str | None = None
    created_at: datetime
    fund: FundRead | None = None
    account: AccountRead | None = None
    member: MemberRead | None = None
    lines: list[VoucherLineRead] = []

    model_config = {"from_attributes": True}


class DashboardSummary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net_income: Decimal
    monthly_income: list[dict]
    monthly_expense: list[dict]
    by_account: list[dict]
    recent_vouchers: list[VoucherRead]


class AnalysisSummary(BaseModel):
    files: list[dict]
    schema_brief: dict


class AiSuggestionRequest(BaseModel):
    description: str
    amount: Decimal | None = None


class AiSuggestionResponse(BaseModel):
    account_code: str | None = None
    account_name: str | None = None
    confidence: float | None = None
    rationale: str | None = None
    candidate_accounts: list[dict] = []
    used_fallback: bool = False
