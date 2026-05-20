'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';

export default function DepartmentCountsPage() {
  const today = new Date();
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    apiFetch(`/offerings/department-summary?${query.toString()}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [year, month]);

  const exportHref = useMemo(() => {
    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    return `${API_BASE}/offerings/department-summary-counts.xlsx?${query.toString()}`;
  }, [year, month]);

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />
      <div className="card page-hero">
        <div>
          <h2>회별 헌금 참여자 수</h2>
          <p className="muted">회별 기준으로 각 헌금 항목 참여자 수를 집계해.</p>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>
      <div className="card form-grid">
        <label>
          년도
          <input value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label>
          월
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>{index + 1}월</option>
            ))}
          </select>
        </label>
      </div>
      {error ? <div className="card">로딩 실패: {error}</div> : null}
      {!data ? <div className="card">집계 조회 중...</div> : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>회별</th>
                {data.columns.map((column) => <th key={column.code}>{column.label}</th>)}
                <th>전체 참여자수</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.department_name}>
                  <td>{row.department_name}</td>
                  {data.columns.map((column) => <td key={column.code}>{row.participant_counts[column.code]}</td>)}
                  <td><strong>{row.total_participants}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
