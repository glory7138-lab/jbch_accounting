'use client';

import { useState } from 'react';
import { API_BASE, apiFetch } from '../../lib/api';

export default function ImportsPage() {
  const [analysis, setAnalysis] = useState(null);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadAnalysis() {
    setLoading(true);
    try {
      setAnalysis(await apiFetch('/imports/sample-analysis'));
    } catch (error) {
      alert(`분석 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function bootstrap() {
    setLoading(true);
    try {
      setBootstrapResult(await apiFetch('/imports/bootstrap', { method: 'POST' }));
    } catch (error) {
      alert(`초기 적재 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <div>
        <h1>엑셀 분석 및 가져오기</h1>
        <p className="muted">샘플 엑셀 구조를 분석하고 기준정보를 DB에 적재할 수 있어.</p>
      </div>

      <div className="card actions">
        <button onClick={loadAnalysis} disabled={loading}>샘플 구조 분석</button>
        <button className="secondary" onClick={bootstrap} disabled={loading}>샘플 기준정보 적재</button>
        <a className="code" href={`${API_BASE}/exports/vouchers.md`} target="_blank">마크다운 내보내기</a>
        <a className="code" href={`${API_BASE}/exports/vouchers.xlsx`} target="_blank">엑셀 내보내기</a>
      </div>

      {bootstrapResult ? (
        <div className="card">
          <h2>초기 적재 결과</h2>
          <pre>{JSON.stringify(bootstrapResult, null, 2)}</pre>
        </div>
      ) : null}

      {analysis ? (
        <div className="card">
          <h2>샘플 분석 결과</h2>
          <pre>{JSON.stringify(analysis.schema_brief, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}
