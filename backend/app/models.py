from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Fund(Base):
    __tablename__ = "funds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    major_category: Mapped[str | None] = mapped_column(String(255))
    middle_category: Mapped[str | None] = mapped_column(String(255))
    report_category: Mapped[str | None] = mapped_column(String(255))
    debit_account: Mapped[str | None] = mapped_column(String(100))
    credit_account: Mapped[str | None] = mapped_column(String(100))
    normal_side: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Member(Base):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_no: Mapped[str | None] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    department_name: Mapped[str | None] = mapped_column(String(255))
    gender_or_section: Mapped[str | None] = mapped_column(String(100))
    age_or_class: Mapped[str | None] = mapped_column(String(100))
    source_sheet: Mapped[str | None] = mapped_column(String(255))


class AccountingPeriod(Base):
    __tablename__ = "accounting_periods"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_accounting_period_year_month"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    month: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(String(50), default="open")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)


class Voucher(Base):
    __tablename__ = "vouchers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voucher_no: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    voucher_date: Mapped[date] = mapped_column(Date, index=True)
    entry_type: Mapped[str] = mapped_column(String(20), index=True)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    fund_id: Mapped[int | None] = mapped_column(ForeignKey("funds.id"))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    counterparty: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
    source_workbook: Mapped[str | None] = mapped_column(String(255))
    source_sheet: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    fund: Mapped[Fund | None] = relationship()
    account: Mapped[Account | None] = relationship()
    member: Mapped[Member | None] = relationship()
    lines: Mapped[list["VoucherLine"]] = relationship(back_populates="voucher", cascade="all, delete-orphan")


class VoucherLine(Base):
    __tablename__ = "voucher_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id", ondelete="CASCADE"), index=True)
    line_no: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    fund_id: Mapped[int | None] = mapped_column(ForeignKey("funds.id"))
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    description: Mapped[str | None] = mapped_column(String(500))
    note: Mapped[str | None] = mapped_column(Text)

    voucher: Mapped[Voucher] = relationship(back_populates="lines")
    account: Mapped[Account | None] = relationship()
    fund: Mapped[Fund | None] = relationship()


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_name: Mapped[str] = mapped_column(String(255), index=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    summary_json: Mapped[dict | list | None] = mapped_column(JSON)


class AiSuggestionLog(Base):
    __tablename__ = "ai_suggestion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String(500))
    suggested_account_code: Mapped[str | None] = mapped_column(String(50))
    suggested_account_name: Mapped[str | None] = mapped_column(String(255))
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 2))
    rationale: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[dict | list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
