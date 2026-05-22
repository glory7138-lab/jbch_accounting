import pytest
from app.models import Account, Voucher
from datetime import date

def test_get_account_codes_empty(client):
    response = client.get("/api/ledger/account-codes")
    assert response.status_code == 200
    assert response.json() == []

def test_create_account_code_success(client, db_session):
    payload = {
        "code": "11100",
        "name": "십일조",
        "major_category": "수입",
        "middle_category": "헌금",
        "report_category": "십일조헌금",
        "account_type": "income",
        "finance_category": "헌금",
        "debit_account": "보통예금",
        "credit_account": "십일조",
        "normal_side": "credit",
        "is_active": True
    }
    response = client.post("/api/ledger/account-codes", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == "11100"
    assert data["name"] == "십일조"
    
    # DB 조회 검증
    account = db_session.query(Account).filter(Account.code == "11100").first()
    assert account is not None
    assert account.name == "십일조"

def test_create_duplicate_account_code_fails(client, db_session):
    # 첫 번째 계정 직접 삽입
    acc = Account(code="11100", name="십일조")
    db_session.add(acc)
    db_session.commit()
    
    # 동일 코드로 API 호출
    payload = {
        "code": "11100",
        "name": "중복십일조",
        "is_active": True
    }
    response = client.post("/api/ledger/account-codes", json=payload)
    assert response.status_code == 400
    assert "이미 존재하는 회계코드" in response.json()["detail"]

def test_delete_account_code_success(client, db_session):
    acc = Account(code="11100", name="십일조")
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)
    
    response = client.delete(f"/api/ledger/account-codes/{acc.id}")
    assert response.status_code == 200
    assert response.json()["message"] == "삭제 완료"
    
    # DB 삭제 검증
    account = db_session.query(Account).filter(Account.id == acc.id).first()
    assert account is None

def test_delete_account_code_in_use_fails(client, db_session):
    # 계정 추가
    acc = Account(code="11100", name="십일조")
    db_session.add(acc)
    db_session.commit()
    db_session.refresh(acc)
    
    # 해당 계정을 참조하는 전표 추가
    voucher = Voucher(
        voucher_no="V2026-001",
        voucher_date=date(2026, 5, 22),
        entry_type="income",
        description="십일조 납부",
        amount=100000,
        account_id=acc.id
    )
    db_session.add(voucher)
    db_session.commit()
    
    # 삭제 API 호출 -> 사용 중이므로 실패해야 함
    response = client.delete(f"/api/ledger/account-codes/{acc.id}")
    assert response.status_code == 400
    assert "이미 전표에 사용 중인 계정코드" in response.json()["detail"]
