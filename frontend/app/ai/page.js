'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function AiPage() {
  const [description, setDescription] = useState('주일 헌금 입금');
  const [amount, setAmount] = useState('100000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await apiFetch('/ai/suggest-account', {
        method: 'POST',
        body: JSON.stringify({ description, amount: Number(amount || 0) }),
      });
      setResult(response);
    } catch (error) {
      alert(`AI 추천 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <div>
        <h1>AI 스마트 분류</h1>
        <p className="muted">적요를 넣으면 OpenAI API 또는 fallback 규칙으로 계정과목을 추천해줘.</p>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label className="form-grid__wide">
          적요
          <input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label>
          금액
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? '분석 중...' : '추천 받기'}</button>
      </form>

      {result ? (
        <div className="card">
          <h2>추천 결과</h2>
          <p><strong>추천 계정:</strong> {result.account_code || '-'} / {result.account_name || '-'}</p>
          <p><strong>신뢰도:</strong> {result.confidence ?? '-'}</p>
          <p><strong>사유:</strong> {result.rationale || '-'}</p>
          <p><strong>Fallback 사용:</strong> {result.used_fallback ? '예' : '아니오'}</p>
          <pre>{JSON.stringify(result.candidate_accounts, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
