import pytest
from datetime import date
from app.models import Account, Voucher, Fund

def test_get_entries_empty(client):
    response = client.get("/api/ledger/entries?category=일반계정&year=2026")
    assert response.status_code == 200
    data = response.json()
    assert data["rows"] == []
    assert data["total_amount"] == 0.0

def test_create_ledger_entry_success(client, db_session):
    # 의존 계정코드 추가
    acc = Account(code="11100", name="십일조")
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)

    payload = {
        "voucher_date": "2026-05-22",
        "entry_type": "income",
        "description": "정기 십일조",
        "amount": 150000,
        "category_name": "일반계정",
        "account_id": acc.id,
        "counterparty": "홍길동",
        "note": "감사합니다"
    }
    
    response = client.post("/api/ledger/entries", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "정기 십일조"
    assert data["amount"] == 150000.0
    assert data["account_code"] == "11100"
    
    # DB 조회 검증
    voucher = db_session.query(Voucher).filter(Voucher.id == data["id"]).first()
    assert voucher is not None
    assert voucher.amount == 150000.0
    assert voucher.counterparty == "홍길동"

def test_update_ledger_entry_success(client, db_session):
    acc = Account(code="11100", name="십일조")
    fund = Fund(code="general", name="일반계정")
    db_session.add_all([acc, fund])
    db_session.commit()
    db_session.refresh(acc)
    db_session.refresh(fund)

    voucher = Voucher(
        voucher_no="L-TEST001",
        voucher_date=date(2026, 5, 22),
        entry_type="income",
        description="정기 십일조",
        amount=150000,
        fund_id=fund.id,
        fund_name=fund.name,
        account_id=acc.id
    )
    db_session.add(voucher)
    db_session.commit()
    db_session.refresh(voucher)

    # 수정 API 호출
    payload = {
        "voucher_date": "2026-05-22",
        "entry_type": "income",
        "description": "수정된 십일조 내역",
        "amount": 200000,
        "category_name": "일반계정",
        "account_id": acc.id,
        "counterparty": "김철수",
        "note": "비고 수정"
    }

    response = client.put(f"/api/ledger/entries/{voucher.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "수정된 십일조 내역"
    assert data["amount"] == 200000.0
    assert data["counterparty"] == "김철수"

    # DB 수정 여부 확인
    db_session.refresh(voucher)
    assert voucher.description == "수정된 십일조 내역"
    assert voucher.amount == 200000.0
