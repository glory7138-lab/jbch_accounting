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

export default function SettlementFormPage() {
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
      const result = await apiFetch(`/settlement/form?year=${year}&month=${month}`);
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
    () => `${API_BASE}/settlement/form.xlsx?year=${year}&month=${month}`,
    [year, month]
  );

  return (
    <div className="grid">
      <SettlementTabs />

      <div className="card page-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2>{year}년 {month}월 결산양식</h2>
            <p className="muted">계정 그룹별 수입·지출 대조표</p>
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
          결산 데이터를 불러오는 중...
        </div>
      ) : data ? (
        <>
          {/* Group-by-group settlement tables */}
          {data.groups.map((group) => {
            const color = GROUP_COLORS[group.group_name] || '#475467';
            const maxRows = Math.max(group.income_items.length, group.expense_items.length);

            return (
              <div key={group.group_name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Group header */}
                <div style={{
                  background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
                  borderBottom: `2px solid ${color}30`,
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <h3 style={{ margin: 0, color, fontSize: '16px' }}>
                    {group.group_name}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#637083' }}>
                    이월금: <strong style={{ color }}>{formatAmount(group.carry_forward)}</strong>
                  </div>
                </div>

                <div className="table-wrap">
                  <table style={{ marginBottom: 0 }}>
                    <thead>
                      <tr style={{ background: '#fafbfc' }}>
                        <th colSpan="3" style={{ textAlign: 'center', borderRight: '2px solid #e5e7eb', color: '#2563eb' }}>수  입</th>
                        <th colSpan="3" style={{ textAlign: 'center', color: '#dc2626' }}>지  출</th>
                      </tr>
                      <tr style={{ background: '#fafbfc' }}>
                        <th style={{ width: '25%' }}>계정과목</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>전월</th>
                        <th style={{ width: '12%', textAlign: 'right', borderRight: '2px solid #e5e7eb' }}>당월</th>
                        <th style={{ width: '25%' }}>계정과목</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>전월</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>당월</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRows }, (_, i) => {
                        const inc = group.income_items[i];
                        const exp = group.expense_items[i];
                        return (
                          <tr key={i}>
                            <td>{inc ? inc.name : ''}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{inc ? formatAmount(inc.prev_month) : ''}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', borderRight: '2px solid #e5e7eb' }}>{inc ? formatAmount(inc.current_month) : ''}</td>
                            <td>{exp ? exp.name : ''}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{exp ? formatAmount(exp.prev_month) : ''}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{exp ? formatAmount(exp.current_month) : ''}</td>
                          </tr>
                        );
                      })}

                      {/* Subtotal row */}
                      <tr style={{ background: '#f0f4ff', fontWeight: 'bold' }}>
                        <td style={{ color: '#2563eb' }}>수입계</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{formatAmount(group.income_total.prev_month)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', borderRight: '2px solid #e5e7eb' }}>{formatAmount(group.income_total.current_month)}</td>
                        <td style={{ color: '#dc2626' }}>지출계</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{formatAmount(group.expense_total.prev_month)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>{formatAmount(group.expense_total.current_month)}</td>
                      </tr>

                      {/* Balance row */}
                      <tr style={{ background: '#fafbfc' }}>
                        <td style={{ fontWeight: '600' }}>전월금</td>
                        <td></td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', borderRight: '2px solid #e5e7eb' }}>{formatAmount(group.prev_balance)}</td>
                        <td style={{ fontWeight: '600' }}>이월금</td>
                        <td></td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color }}>
                          {formatAmount(group.carry_forward)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand total card */}
          {data.grand_total && (
            <div className="card" style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: 'white',
              padding: '24px',
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>전체 합계</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>총 수입 (당월)</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'monospace' }}>
                    {formatAmount(data.grand_total.income_curr)}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>총 지출 (당월)</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'monospace' }}>
                    {formatAmount(data.grand_total.expense_curr)}
                  </div>
                </div>
                <div style={{
                  background: data.grand_total.net_curr >= 0
                    ? 'rgba(16,185,129,0.15)'
                    : 'rgba(239,68,68,0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                }}>
                  <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '4px' }}>순이익 (당월)</div>
                  <div style={{
                    fontSize: '22px',
                    fontWeight: '700',
                    fontFamily: 'monospace',
                    color: data.grand_total.net_curr >= 0 ? '#10b981' : '#ef4444',
                  }}>
                    {formatAmount(data.grand_total.net_curr)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
