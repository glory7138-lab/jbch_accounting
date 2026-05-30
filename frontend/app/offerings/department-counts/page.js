'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE, formatMoney, formatNumber } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

export default function DepartmentCountsPage() {
  const { year, setYear } = useYear();
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMonth = sessionStorage.getItem('dept_counts_month');
      if (savedMonth !== null) setMonth(savedMonth);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized || !year) return;

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dept_counts_month', month);
    }

    setError('');

    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || year.length < 4) {
      return;
    }

    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    apiFetch(`/offerings/department-summary?${query.toString()}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [year, month, isInitialized]);

  const exportHref = useMemo(() => {
    const yearNum = Number(year);
    if (!year || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || year.length < 4) {
      return '#';
    }
    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    return `${API_BASE}/offerings/department-summary-counts.xlsx?${query.toString()}`;
  }, [year, month]);

  const columnTotals = useMemo(() => {
    if (!data || !data.rows || !data.columns) return {};
    const sums = {};
    data.columns.forEach((col) => {
      sums[col.code] = 0;
    });
    sums['total_participants'] = 0;

    data.rows.forEach((row) => {
      data.columns.forEach((col) => {
        sums[col.code] += Number(row.participant_counts?.[col.code] || 0);
      });
      sums['total_participants'] += Number(row.total_participants || 0);
    });
    return sums;
  }, [data]);

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
                {data.columns.map((column) => <th key={column.code} className="text-right">{column.label}</th>)}
                <th className="text-right">전체 참여자수</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.department_name}>
                  <td>{row.department_name}</td>
                  {data.columns.map((column) => <td key={column.code} className="text-right">{formatNumber(row.participant_counts[column.code], '0')}</td>)}
                  <td className="text-right"><strong>{formatNumber(row.total_participants, '0')}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold', backgroundColor: 'var(--background-alt, #f8fafc)' }}>
                <td>합계</td>
                {data.columns.map((column) => (
                  <td key={column.code} className="text-right">{formatNumber(columnTotals[column.code], '0')}</td>
                ))}
                <td className="text-right"><strong>{formatNumber(columnTotals['total_participants'], '0')}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
