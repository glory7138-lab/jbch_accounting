'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SettlementTabs from '../../../components/SettlementTabs';
import { apiFetch, API_BASE } from '../../../lib/api';

const GROUP_COLORS = {
  '일반계정': '#2563eb',
  '교회학교': '#0891b2',
  '건축계정': '#7c3aed',
  '사랑': '#e11d48',
  '선교비': '#059669',
  '해외후원': '#d97706',
  '국내선교': '#6366f1',
};

function formatAmount(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (isNaN(num)) return '-';
  if (num === 0) return '-';
  return num.toLocaleString('ko-KR');
}

export default function WeeklyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(`/settlement/weekly-report?year=${year}&month=${month}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [year, month]);

  const exportHref = useMemo(
    () => `${API_BASE}/settlement/weekly-report.xlsx?year=${year}&month=${month}`,
    [year, month]
  );

  return (
    <div className="grid">
      <SettlementTabs />

      <div className="card page-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2>{year}년 {month}월 주간보고자료</h2>
            <p className="muted">계정 그룹별 주차별 수입·지출 보고자료</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}월</option>
              ))}
            </select>
          </div>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      {error && <div className="card" style={{ color: '#d93025' }}>오류: {error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#637083' }}>
          주간 결산 데이터를 불러오는 중...
        </div>
      ) : data ? (
        <>
          {data.groups.map((group) => {
            const color = GROUP_COLORS[group.group_name] || '#475467';
            return (
              <div key={group.group_name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{
                  background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
                  borderBottom: `2px solid ${color}30`,
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <h3 style={{ margin: 0, color, fontSize: '16px' }}>{group.group_name} 주간 결산</h3>
                  <div style={{ fontSize: '12px', color: '#637083' }}>
                    전월잔액: <strong>{formatAmount(group.prev_balance)}</strong>
                  </div>
                </div>

                <div className="table-wrap">
                  <table style={{ marginBottom: 0, minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ background: '#fafbfc' }}>
                        <th style={{ width: '60px' }}>구분</th>
                        <th style={{ width: '180px' }}>계정과목</th>
                        <th style={{ textAlign: 'right' }}>1주차</th>
                        <th style={{ textAlign: 'right' }}>2주차</th>
                        <th style={{ textAlign: 'right' }}>3주차</th>
                        <th style={{ textAlign: 'right' }}>4주차</th>
                        <th style={{ textAlign: 'right' }}>5주차</th>
                        <th style={{ textAlign: 'right', fontWeight: 'bold' }}>누적</th>
                        <th style={{ textAlign: 'right' }}>예산</th>
                        <th style={{ textAlign: 'right' }}>차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 수입 항목 리스트 */}
                      {group.income_items.map((item, idx) => (
                        <tr key={`inc-${idx}`}>
                          {idx === 0 && <td rowSpan={group.income_items.length + 1} style={{ textAlign: 'center', fontWeight: 'bold', color: '#2563eb', borderRight: '1px solid #e5e7eb', background: '#f5f8ff' }}>수입</td>}
                          <td style={{ fontWeight: '600' }}>{item.name}</td>
                          {item.weekly.map((w, wIdx) => (
                            <td key={wIdx} style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(w)}</td>
                          ))}
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', background: '#f5f8ff' }}>{formatAmount(item.cumulative)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(item.budget)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: item.difference < 0 ? '#dc2626' : '#10b981' }}>{formatAmount(item.difference)}</td>
                        </tr>
                      ))}
                      {/* 수입계 */}
                      <tr style={{ background: '#f5f8ff', fontWeight: 'bold' }}>
                        <td>수입 소계</td>
                        {group.income_weekly_totals.map((t, wIdx) => (
                          <td key={wIdx} style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(t)}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(group.income_cumulative)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(group.income_budget_total)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: group.income_difference_total < 0 ? '#dc2626' : '#10b981' }}>{formatAmount(group.income_difference_total)}</td>
                      </tr>


                      {/* 지출 항목 리스트 */}
                      {group.expense_items.map((item, idx) => (
                        <tr key={`exp-${idx}`}>
                          {idx === 0 && <td rowSpan={group.expense_items.length + 1} style={{ textAlign: 'center', fontWeight: 'bold', color: '#dc2626', borderRight: '1px solid #e5e7eb', background: '#fff5f5' }}>지출</td>}
                          <td style={{ fontWeight: '600' }}>{item.name}</td>
                          {item.weekly.map((w, wIdx) => (
                            <td key={wIdx} style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(w)}</td>
                          ))}
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold', background: '#fff5f5' }}>{formatAmount(item.cumulative)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(item.budget)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(item.difference)}</td>
                        </tr>
                      ))}
                      {/* 지출계 */}
                      <tr style={{ background: '#fff5f5', fontWeight: 'bold' }}>
                        <td>지출 소계</td>
                        {group.expense_weekly_totals.map((t, wIdx) => (
                          <td key={wIdx} style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(t)}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(group.expense_cumulative)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatAmount(group.expense_budget_total)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: group.expense_difference_total < 0 ? '#dc2626' : '#10b981' }}>{formatAmount(group.expense_difference_total)}</td>
                      </tr>


                      {/* 계정잔액 (차주이월 누계) */}
                      <tr style={{ background: '#fafbfc', fontWeight: 'bold', borderTop: '2px solid #e5e7eb' }}>
                        <td colSpan="2" style={{ textAlign: 'center' }}>계정잔액</td>
                        {group.account_balances.map((b, wIdx) => (
                          <td key={wIdx} style={{ textAlign: 'right', fontFamily: 'monospace', color: b < 0 ? '#dc2626' : '#2563eb' }}>
                            {formatAmount(b)}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', background: '#fafbfc', color: group.account_balances[4] < 0 ? '#dc2626' : '#2563eb' }}>
                          {formatAmount(group.account_balances[4])}
                        </td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
