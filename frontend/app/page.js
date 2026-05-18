'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from '../components/StatCard';
import { apiFetch } from '../lib/api';

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/dashboard/summary')
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="card">대시보드 로딩 실패: {error}</div>;
  if (!summary) return <div className="card">대시보드 로딩 중...</div>;

  const chartData = Array.from(new Set([...summary.monthly_income.map((d) => d.month), ...summary.monthly_expense.map((d) => d.month)])).map((month) => ({
    month,
    income: Number(summary.monthly_income.find((item) => item.month === month)?.amount || 0),
    expense: Number(summary.monthly_expense.find((item) => item.month === month)?.amount || 0),
  }));

  return (
    <div>
      <h1>회계 대시보드</h1>
      <p className="muted">엑셀에서 파악한 회계 구조를 기준으로 월별 손익과 최근 전표를 보여줍니다.</p>

      <section className="grid grid--3">
        <StatCard title="총 수입" value={`${money(summary.total_income)}원`} tone="success" />
        <StatCard title="총 지출" value={`${money(summary.total_expense)}원`} tone="danger" />
        <StatCard title="순손익" value={`${money(summary.net_income)}원`} />
      </section>

      <h2 className="section-title">월별 수입/지출</h2>
      <div className="card" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => money(value)} />
            <Legend />
            <Bar dataKey="income" name="수입" fill="#2563eb" />
            <Bar dataKey="expense" name="지출" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <section className="grid grid--2">
        <div className="card">
          <h2>계정과목별 합계</h2>
          <table>
            <thead>
              <tr><th>계정과목</th><th>합계</th></tr>
            </thead>
            <tbody>
              {summary.by_account.map((row) => (
                <tr key={row.account}>
                  <td>{row.account}</td>
                  <td>{money(row.amount)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>최근 전표</h2>
          <table>
            <thead>
              <tr><th>일자</th><th>적요</th><th>금액</th></tr>
            </thead>
            <tbody>
              {summary.recent_vouchers.map((voucher) => (
                <tr key={voucher.id}>
                  <td>{voucher.voucher_date}</td>
                  <td>{voucher.description}</td>
                  <td>{money(voucher.amount)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
