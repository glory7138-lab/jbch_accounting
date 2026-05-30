'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE, formatMoney } from '../../../lib/api';
import { settlementMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

function money(value) {
  return formatMoney(value);
}

export default function QuarterlySettlementPage() {
  const { year } = useYear();
  const [quarter, setQuarter] = useState('1');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedQuarter = sessionStorage.getItem('settlement_quarter');
      if (savedQuarter !== null) setQuarter(savedQuarter);
    }
  }, []);

  useEffect(() => {
    if (!year) return;

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('settlement_quarter', quarter);
    }

    setLoading(true);
    setError('');

    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      setLoading(false);
      return;
    }

    apiFetch(`/settlement/quarterly?year=${year}&quarter=${quarter}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [year, quarter]);

  const exportHref = useMemo(() => {
    const yearNum = Number(year);
    if (!year || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return '#';
    }
    return `${API_BASE}/settlement/quarterly.xlsx?year=${year}&quarter=${quarter}`;
  }, [year, quarter]);

  return (
    <div className="grid">
      <SectionTabs title="월말결산" items={settlementMenuItems} />
      <div className="card page-hero">
        <div>
          <h2>분기별 회계결산보고</h2>
          <p className="muted">선택한 분기(3개월) 동안의 수입 및 지출 내역, 교회운영비 세부 내역을 집계하여 결산 보고서를 출력하고 엑셀로 다운로드할 수 있어.</p>
        </div>
        <ExportButtons items={[{ label: '분기 결산 엑셀 다운로드', href: exportHref }]} />
      </div>

      <div className="card form-grid">
        <label>
          분기 선택
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="1">1분기 (1월 ~ 3월)</option>
            <option value="2">2분기 (4월 ~ 6월)</option>
            <option value="3">3분기 (7월 ~ 9월)</option>
            <option value="4">4분기 (10월 ~ 12월)</option>
          </select>
        </label>
      </div>

      {loading && <div className="card">조회 중...</div>}
      {error && <div className="card text-danger">조회 실패: {error}</div>}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* 1. 수입 내역 */}
          <div className="card">
            <h3 style={{ marginBottom: '16px', fontWeight: '800', color: 'var(--primary, #2563eb)' }}>1. 수입 내역</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>상세</th>
                    <th style={{ textAlign: 'right' }}>{data.months[0]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[1]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[2]}</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>분기합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.income.map((item, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: '500' }}>
                        {item.category !== '헌금이외의 수입합계' && index === 0 ? '헌금' : ''}
                        {item.category === '헌금이외의 수입합계' ? '헌금이외의 수입' : ''}
                      </td>
                      <td style={{ fontWeight: '600' }}>{item.category}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[0])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[1])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[2])}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>{money(item.total)}</td>
                    </tr>
                  ))}
                  {/* Subtotal row */}
                  <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                    <td colSpan="2">합 계</td>
                    <td style={{ textAlign: 'right' }}>{money(data.income_total[0])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.income_total[1])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.income_total[2])}</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary, #2563eb)' }}>
                      {money(data.income_total.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. 지출 내역 */}
          <div className="card">
            <h3 style={{ marginBottom: '16px', fontWeight: '800', color: 'var(--primary, #2563eb)' }}>2. 지출 내역</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th style={{ textAlign: 'right' }}>{data.months[0]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[1]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[2]}</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>분기합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expense.map((item, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: '600' }}>{item.category}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[0])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[1])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[2])}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>{money(item.total)}</td>
                    </tr>
                  ))}
                  {/* Subtotal row */}
                  <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                    <td>합 계</td>
                    <td style={{ textAlign: 'right' }}>{money(data.expense_total[0])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.expense_total[1])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.expense_total[2])}</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary, #2563eb)' }}>
                      {money(data.expense_total.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. 교회운영비 내역 */}
          <div className="card">
            <h3 style={{ marginBottom: '16px', fontWeight: '800', color: 'var(--primary, #2563eb)' }}>3. 교회운영비 내역</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th style={{ textAlign: 'right' }}>{data.months[0]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[1]}</th>
                    <th style={{ textAlign: 'right' }}>{data.months[2]}</th>
                    <th style={{ textAlign: 'right', fontWeight: 'bold' }}>분기합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.operating_expenses.map((item, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: '600' }}>{item.category}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[0])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[1])}</td>
                      <td style={{ textAlign: 'right' }}>{money(item.monthly[2])}</td>
                      <td style={{ textAlign: 'right', fontWeight: '700' }}>{money(item.total)}</td>
                    </tr>
                  ))}
                  {/* Subtotal row */}
                  <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                    <td>합 계</td>
                    <td style={{ textAlign: 'right' }}>{money(data.operating_total[0])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.operating_total[1])}</td>
                    <td style={{ textAlign: 'right' }}>{money(data.operating_total[2])}</td>
                    <td style={{ textAlign: 'right', color: 'var(--primary, #2563eb)' }}>
                      {money(data.operating_total.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 분기말 잔고현황 */}
          <div className="card stats-inline" style={{ padding: '24px' }}>
            <div>
              <strong style={{ fontSize: '15px', color: '#64748b' }}>4. 분기말일자 현재 잔고현황</strong>
              <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: 'var(--text, #0f172a)' }}>
                예, 적금 및 현금 : {money(data.ending_balance)}원
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
