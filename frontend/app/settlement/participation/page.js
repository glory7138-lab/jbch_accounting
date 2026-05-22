'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SettlementTabs from '../../../components/SettlementTabs';
import { apiFetch, API_BASE } from '../../../lib/api';

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function formatAmount(val) {
  if (val === null || val === undefined || val === '') return '-';
  const num = Number(val);
  if (isNaN(num)) return '-';
  if (num === 0) return '-';
  return num.toLocaleString('ko-KR');
}

function formatCount(val) {
  if (val === null || val === undefined) return '-';
  const num = Number(val);
  if (isNaN(num) || num === 0) return '-';
  return num.toLocaleString('ko-KR');
}

export default function ParticipationPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(`/settlement/participation?year=${year}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [year]);

  const exportHref = useMemo(
    () => `${API_BASE}/settlement/participation.xlsx?year=${year}`,
    [year]
  );

  return (
    <div className="grid">
      <SettlementTabs />

      <div className="card page-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <h2>참여현황 및 주요관리항목 지출</h2>
            <p className="muted">월별 헌금 참여 인원·금액 현황과 주요 관리항목 지출 추이</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold' }}>기준 연도:</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      {error && <div className="card" style={{ color: '#d93025' }}>오류: {error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#637083' }}>
          데이터를 불러오는 중...
        </div>
      ) : data ? (
        <>
          {/* Section 1: 헌금 참여 현황 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(135deg, #2563eb10 0%, #2563eb05 100%)',
              borderBottom: '2px solid #2563eb20',
              padding: '14px 20px',
            }}>
              <h3 style={{ margin: 0, color: '#2563eb', fontSize: '16px' }}>
                ◆ 월별 헌금 참여 현황
              </h3>
            </div>

            <div className="table-wrap">
              <table style={{ marginBottom: 0, minWidth: '1100px' }}>
                <thead>
                  <tr style={{ background: '#fafbfc' }}>
                    <th style={{ width: '140px', position: 'sticky', left: 0, background: '#fafbfc', zIndex: 2 }}>헌금 항목</th>
                    <th style={{ width: '50px', textAlign: 'center' }}>구분</th>
                    <th style={{ textAlign: 'right', fontSize: '12px' }}>{year - 1}.12월</th>
                    {MONTH_LABELS.map((label) => (
                      <th key={label} style={{ textAlign: 'right', fontSize: '12px' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.offering_participation.map((offering, idx) => (
                    <>
                      {/* 인원 row */}
                      <tr key={`${idx}-count`} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                        <td
                          rowSpan={2}
                          style={{
                            fontWeight: '600',
                            fontSize: '13px',
                            position: 'sticky',
                            left: 0,
                            background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                            zIndex: 1,
                            borderRight: '1px solid #e5e7eb',
                          }}
                        >
                          {offering.offering_name}
                        </td>
                        <td style={{
                          textAlign: 'center',
                          fontSize: '11px',
                          color: '#2563eb',
                          fontWeight: '600',
                        }}>인원</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                          {formatCount(offering.prev_december.count)}
                        </td>
                        {offering.monthly.map((m) => (
                          <td key={m.month} style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                            {formatCount(m.count)}
                          </td>
                        ))}
                      </tr>
                      {/* 금액 row */}
                      <tr key={`${idx}-amount`} style={{
                        background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                        borderBottom: '2px solid #f0f0f0',
                      }}>
                        <td style={{
                          textAlign: 'center',
                          fontSize: '11px',
                          color: '#dc2626',
                          fontWeight: '600',
                        }}>금액</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#637083' }}>
                          {formatAmount(offering.prev_december.amount)}
                        </td>
                        {offering.monthly.map((m) => (
                          <td key={m.month} style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '12px', color: '#637083' }}>
                            {formatAmount(m.amount)}
                          </td>
                        ))}
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: 주요 관리항목 지출 현황 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(135deg, #dc262610 0%, #dc262605 100%)',
              borderBottom: '2px solid #dc262620',
              padding: '14px 20px',
            }}>
              <h3 style={{ margin: 0, color: '#dc2626', fontSize: '16px' }}>
                ◆ 주요 관리항목 지출 현황
              </h3>
            </div>

            <div className="table-wrap">
              <table style={{ marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: '#fafbfc' }}>
                    <th style={{ width: '140px' }}>항목</th>
                    {MONTH_LABELS.map((label) => (
                      <th key={label} style={{ textAlign: 'right', fontSize: '12px' }}>{label}</th>
                    ))}
                    <th style={{ textAlign: 'right', fontWeight: '700' }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.major_expenses.map((expense, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ fontWeight: '600', fontSize: '13px' }}>{expense.expense_name}</td>
                      {expense.monthly.map((m) => (
                        <td key={m.month} style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                          {formatAmount(m.amount)}
                        </td>
                      ))}
                      <td style={{
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: '700',
                        background: '#f0f4ff',
                      }}>
                        {formatAmount(expense.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
