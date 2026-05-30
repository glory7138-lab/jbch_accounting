'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE, formatMoney } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

function money(value) {
  return formatMoney(value);
}

export default function OfferingCumulativePage() {
  const { year, setYear } = useYear();
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMonth = sessionStorage.getItem('cumulative_month');
      if (savedMonth !== null) setMonth(savedMonth);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized || !year) return;

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cumulative_month', month);
    }

    setError('');

    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || year.length < 4) {
      return;
    }

    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    apiFetch(`/offerings/weekly-cumulative?${query.toString()}`)
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
    return `${API_BASE}/offerings/weekly-cumulative.xlsx?${query.toString()}`;
  }, [year, month]);

  const totals = useMemo(() => {
    if (!data || !data.rows) return {};
    const keys = ['11000', '11200', '12100', '13000', '11300', '12000', '12200', '14000', 'row_total'];
    const sums = {};
    keys.forEach((k) => {
      sums[k] = 0;
    });
    data.rows.forEach((row) => {
      keys.forEach((k) => {
        if (k === 'row_total') {
          sums[k] += Number(row.row_total || 0);
        } else {
          sums[k] += Number(row.offerings?.[k] || 0);
        }
      });
    });
    return sums;
  }, [data]);

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />
      <div className="card page-hero">
        <div>
          <h2>주간헌금현황 누계</h2>
          <p className="muted">주간 헌금으로 저장된 내역을 기간별로 이어붙여 보여주는 집계표야.</p>
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
      {!data ? (
        <div className="card">누계 조회 중...</div>
      ) : (
        <>
          <div className="card stats-inline">
            <div><strong>행 수</strong><br />{data.row_count}</div>
            <div><strong>총 합계</strong><br />{money(data.total_amount)}원</div>
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>일자</th>
                  <th>봉투번호</th>
                  <th>이름</th>
                  <th>회별</th>
                  <th>구역</th>
                  <th className="text-right">십일조</th>
                  <th className="text-right">주일헌금</th>
                  <th className="text-right">세계선교분담금</th>
                  <th className="text-right">후원회비</th>
                  <th className="text-right">건축헌금</th>
                  <th className="text-right">선교회비</th>
                  <th className="text-right">세계선교</th>
                  <th className="text-right">사랑의헌금</th>
                  <th className="text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${row.voucher_date}-${row.envelope_no}-${index}`}>
                    <td>{row.voucher_date}</td>
                    <td>{row.envelope_no}</td>
                    <td>{row.member_name}</td>
                    <td>{row.department_name}</td>
                    <td>{row.district_name}</td>
                    <td className="text-right">{money(row.offerings?.['11000'])}</td>
                    <td className="text-right">{money(row.offerings?.['11200'])}</td>
                    <td className="text-right">{money(row.offerings?.['12100'])}</td>
                    <td className="text-right">{money(row.offerings?.['13000'])}</td>
                    <td className="text-right">{money(row.offerings?.['11300'])}</td>
                    <td className="text-right">{money(row.offerings?.['12000'])}</td>
                    <td className="text-right">{money(row.offerings?.['12200'])}</td>
                    <td className="text-right">{money(row.offerings?.['14000'])}</td>
                    <td className="text-right"><strong>{money(row.row_total)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', backgroundColor: 'var(--background-alt, #f8fafc)' }}>
                  <td colSpan="5" style={{ textAlign: 'center' }}>합계</td>
                  <td className="text-right">{money(totals['11000'])}</td>
                  <td className="text-right">{money(totals['11200'])}</td>
                  <td className="text-right">{money(totals['12100'])}</td>
                  <td className="text-right">{money(totals['13000'])}</td>
                  <td className="text-right">{money(totals['11300'])}</td>
                  <td className="text-right">{money(totals['12000'])}</td>
                  <td className="text-right">{money(totals['12200'])}</td>
                  <td className="text-right">{money(totals['14000'])}</td>
                  <td className="text-right"><strong>{money(totals['row_total'])}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
