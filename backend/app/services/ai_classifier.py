from __future__ import annotations

import json
from decimal import Decimal

from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, AiSuggestionLog

settings = get_settings()
SUPPORTED_MODELS = {"gpt-4.1-nano", "gpt-4o", "o1-mini"}


def _fallback_classifier(description: str, accounts: list[Account]) -> dict:
    lowered = description.lower()
    keywords = {
        "선교": ["선교", "mission"],
        "헌금": ["헌금", "십일조", "감사"],
        "교제": ["식대", "간식", "다과", "교제"],
        "교육": ["교재", "교육", "훈련"],
        "복지": ["구제", "후원", "복지"],
    }
    for account in accounts:
        haystack = " ".join(filter(None, [account.code, account.name, account.major_category, account.middle_category, account.report_category])).lower()
        for _, words in keywords.items():
            if any(word in lowered and word in haystack for word in words):
                return {
                    "account_code": account.code,
                    "account_name": account.name,
                    "confidence": 0.56,
                    "rationale": "키워드 기반 규칙 추천입니다.",
                    "candidate_accounts": [{"code": account.code, "name": account.name}],
                    "used_fallback": True,
                    "used_model": "fallback",
                }
    first = accounts[0] if accounts else None
    return {
        "account_code": first.code if first else None,
        "account_name": first.name if first else None,
        "confidence": 0.3,
        "rationale": "기본 추천입니다. 계정코드 학습 데이터가 더 쌓이면 정확도가 좋아집니다.",
        "candidate_accounts": ([{"code": first.code, "name": first.name}] if first else []),
        "used_fallback": True,
        "used_model": "fallback",
    }


def _resolve_model(requested_model: str | None) -> str:
    candidate = (requested_model or settings.openai_model or "gpt-4.1-nano").strip()
    return candidate if candidate in SUPPORTED_MODELS else "gpt-4.1-nano"


def suggest_account(db: Session, description: str, amount: Decimal | None = None, model: str | None = None) -> dict:
    accounts = db.scalars(select(Account).where(Account.is_active == True).order_by(Account.code.asc()).limit(80)).all()
    selected_model = _resolve_model(model)

    if not settings.openai_api_key:
        result = _fallback_classifier(description, accounts)
        db.add(AiSuggestionLog(description=description, suggested_account_code=result["account_code"], suggested_account_name=result["account_name"], confidence=result["confidence"], rationale=result["rationale"], raw_response=result))
        db.commit()
        return result

    client = OpenAI(api_key=settings.openai_api_key)
    account_options = [
        {
            "code": account.code,
            "name": account.name,
            "major_category": account.major_category,
            "middle_category": account.middle_category,
            "report_category": account.report_category,
        }
        for account in accounts
    ]
    prompt = {
        "description": description,
        "amount": float(amount) if amount is not None else None,
        "accounts": account_options,
        "instruction": "적요와 금액을 보고 가장 적절한 계정코드 하나를 추천하고 confidence(0~1), rationale, candidate_accounts를 JSON으로 반환하세요.",
    }
    response = client.responses.create(
        model=selected_model,
        input=[{"role": "user", "content": [{"type": "text", "text": json.dumps(prompt, ensure_ascii=False)}]}],
    )
    text = response.output_text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = _fallback_classifier(description, accounts)
        parsed["rationale"] = f"LLM 응답 파싱 실패, fallback 사용: {text[:200]}"
        parsed["used_fallback"] = True

    result = {
        "account_code": parsed.get("account_code"),
        "account_name": parsed.get("account_name"),
        "confidence": parsed.get("confidence"),
        "rationale": parsed.get("rationale"),
        "candidate_accounts": parsed.get("candidate_accounts", []),
        "used_fallback": parsed.get("used_fallback", False),
        "used_model": selected_model if not parsed.get("used_fallback", False) else parsed.get("used_model", "fallback"),
    }
    db.add(AiSuggestionLog(description=description, suggested_account_code=result["account_code"], suggested_account_name=result["account_name"], confidence=result["confidence"], rationale=result["rationale"], raw_response=result))
    db.commit()
    return result
