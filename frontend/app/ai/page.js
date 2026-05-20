'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/api';

const MODEL_OPTIONS = [
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'o1-mini', label: 'o1-mini' },
];

export default function AiPage() {
  const [description, setDescription] = useState('주일 헌금 입금');
  const [amount, setAmount] = useState('100000');
  const [model, setModel] = useState('gpt-4.1-nano');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await apiFetch('/ai/suggest-account', {
        method: 'POST',
        body: JSON.stringify({ description, amount: Number(amount || 0), model }),
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
        <p className="muted">적요를 넣으면 OpenAI API 또는 fallback 규칙으로 계정과목을 추천해줘. 이제 GPT-4o와 o1-mini도 고를 수 있어.</p>
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
        <label>
          모델
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading}>{loading ? '분석 중...' : '추천 받기'}</button>
      </form>

      {result ? (
        <div className="card">
          <h2>추천 결과</h2>
          <p><strong>사용 모델:</strong> {result.used_model || '-'}</p>
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
