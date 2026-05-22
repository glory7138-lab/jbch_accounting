'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StatCard from '../components/StatCard';
import { apiFetch, API_BASE } from '../lib/api';

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

const COLORS = [
  '#2563eb', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#14b8a6', // Teal
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'offerings'

  // 일반 회계 요약 상태
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');

  // 헌금 통계 분석 상태
  const [offeringsData, setOfferingsData] = useState(null);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState('');

  // 필터 상태 (기본 당해년도)
  const [startYm, setStartYm] = useState('');
  const [endYm, setEndYm] = useState('');
  const [department, setDepartment] = useState('전체');
  const [accountId, setAccountId] = useState('전체');

  // 필터용 원본 리스트
  const [accountsList, setAccountsList] = useState([]);
  const [departmentsList] = useState(['전체', '봉사회', '어머니회', '은장회', '청년회', '미지정']);

  // 초기 로드: 일반 회계 요약 및 필터용 계정과목 로드
  useEffect(() => {
    // 1. 일반 요약 로드
    apiFetch('/dashboard/summary')
      .then(setSummary)
      .catch((err) => setSummaryError(err.message));

    // 2. 계정과목 목록 로드
    apiFetch('/accounts')
      .then((data) => {
        // 수입/헌금 성격의 과목 필터링 (code 1로 시작하거나 name에 헌금/회비가 포함된 것)
        const incomeAccs = data.filter(
          (a) => a.code.startsWith('1') || a.name.includes('헌금') || a.name.includes('회비')
        );
        setAccountsList(incomeAccs);
      })
      .catch((err) => console.error('계정과목 로드 실패:', err));

    // 3. 기본 조회 기간 당해년도로 셋업 (예: 2026-01 ~ 2026-12)
    const thisYear = new Date().getFullYear();
    setStartYm(`${thisYear}-01`);
    setEndYm(`${thisYear}-12`);
  }, []);

  // 헌금 통계 조회 함수
  const fetchOfferingsData = () => {
    setOfferingsLoading(true);
    setOfferingsError('');

    const params = new URLSearchParams();
    if (startYm) params.append('start_ym', startYm);
    if (endYm) params.append('end_ym', endYm);
    if (department && department !== '전체') {
      params.append('department', department);
    }
    if (accountId && accountId !== '전체') {
      params.append('account_id', accountId);
    }

    apiFetch(`/dashboard/offerings?${params.toString()}`)
      .then((data) => {
        setOfferingsData(data);
        setOfferingsLoading(false);
      })
      .catch((err) => {
        setOfferingsError(err.message);
        setOfferingsLoading(false);
      });
  };

  // 탭이 'offerings'로 최초 전환될 때 자동 조회
  useEffect(() => {
    if (activeTab === 'offerings' && startYm && endYm) {
      fetchOfferingsData();
    }
  }, [activeTab]);

  // 엑셀 다운로드 핸들러
  const handleExcelDownload = () => {
    const params = new URLSearchParams();
    if (startYm) params.append('start_ym', startYm);
    if (endYm) params.append('end_ym', endYm);
    if (department && department !== '전체') params.append('department', department);
    if (accountId && accountId !== '전체') params.append('account_id', accountId);

    window.open(`${API_BASE}/exports/offerings-dashboard.xlsx?${params.toString()}`);
  };

  // 차트 데이터 가공 (종류별 추이)
  const trendChartData = offeringsData
    ? (offeringsData.monthly_trends || []).map((t) => {
        const item = { period: t.period };
        Object.entries(t.amounts).forEach(([k, v]) => {
          item[k] = Number(v);
        });
        return item;
      })
    : [];

  const offeringNames = offeringsData
    ? Array.from(
        new Set(
          (offeringsData.monthly_trends || []).flatMap((t) => Object.keys(t.amounts))
        )
      )
    : [];

  // 에러 또는 로딩 예외 처리 (탭에 맞추어)
  if (activeTab === 'general') {
    if (summaryError) return <div className="card">대시보드 로딩 실패: {summaryError}</div>;
    if (!summary) return <div className="card">대시보드 로딩 중...</div>;
  }

  // 일반 요약 탭 차트 데이터 가공
  const generalChartData = summary
    ? Array.from(
        new Set([
          ...summary.monthly_income.map((d) => d.month),
          ...summary.monthly_expense.map((d) => d.month),
        ])
      ).map((month) => ({
        month,
        income: Number(summary.monthly_income.find((item) => item.month === month)?.amount || 0),
        expense: Number(summary.monthly_expense.find((item) => item.month === month)?.amount || 0),
      }))
    : [];

  return (
    <div>
      {/* 탭 헤더 */}
      <div className="card section-tabs" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>대시보드</h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {activeTab === 'general'
                ? '엑셀에서 파악한 회계 구조를 기준으로 월별 손익과 최근 전표를 보여줍니다.'
                : '기간, 부서, 헌금 종류별 헌금 통계 분석 및 세부 현황을 다각도의 차트로 제공합니다.'}
            </p>
          </div>
          <div className="section-tabs__links" style={{ display: 'flex', gap: 8 }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('general');
              }}
              className={activeTab === 'general' ? 'active' : ''}
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              일반 회계 요약
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('offerings');
              }}
              className={activeTab === 'offerings' ? 'active' : ''}
              style={{ display: 'inline-block', textDecoration: 'none' }}
            >
              헌금 통계 분석
            </a>
          </div>
        </div>
      </div>

      {/* 1. 일반 회계 요약 탭 */}
      {activeTab === 'general' && summary && (
        <div>
          <section className="grid grid--3" style={{ marginBottom: 24 }}>
            <StatCard title="총 수입" value={`${money(summary.total_income)}원`} tone="success" />
            <StatCard title="총 지출" value={`${money(summary.total_expense)}원`} tone="danger" />
            <StatCard title="순손익" value={`${money(summary.net_income)}원`} />
          </section>

          <h2 className="section-title">월별 수입/지출</h2>
          <div className="card" style={{ height: 340, marginBottom: 24 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={generalChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} formatter={(value) => `${money(value)}`} />
                <Tooltip
                  formatter={(value) => money(value)}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Legend />
                <Bar dataKey="income" name="수입" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <section className="grid grid--2">
            <div className="card">
              <h2>계정과목별 합계</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>계정과목</th>
                      <th style={{ textAlign: 'right' }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_account.map((row) => (
                      <tr key={row.account}>
                        <td>{row.account}</td>
                        <td style={{ textAlign: 'right' }}>{money(row.amount)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h2>최근 전표</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>일자</th>
                      <th>적요</th>
                      <th style={{ textAlign: 'right' }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent_vouchers.map((voucher) => (
                      <tr key={voucher.id}>
                        <td>{voucher.voucher_date}</td>
                        <td>{voucher.description}</td>
                        <td style={{ textAlign: 'right' }}>{money(voucher.amount)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 2. 헌금 통계 분석 탭 */}
      {activeTab === 'offerings' && (
        <div>
          {/* 필터 제어 바 */}
          <div className="card" style={{ marginBottom: 24, padding: 18 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'grid', gap: 6, minWidth: 140 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>시작 연월</label>
                <input
                  type="month"
                  value={startYm}
                  onChange={(e) => setStartYm(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'grid', gap: 6, minWidth: 140 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>종료 연월</label>
                <input
                  type="month"
                  value={endYm}
                  onChange={(e) => setEndYm(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'grid', gap: 6, minWidth: 140 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>회별 (부서)</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {departmentsList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>헌금 종류</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="전체">전체</option>
                  {accountsList.map((acc) => {
                    const isDuplicate = accountsList.filter((a) => a.name === acc.name).length > 1;
                    let displayName = acc.name;
                    if (isDuplicate) {
                      const details = [];
                      if (acc.middle_category) details.push(acc.middle_category);
                      if (acc.report_category) details.push(acc.report_category);
                      if (details.length > 0) {
                        displayName = `${acc.name} (${details.join(' > ')})`;
                      } else {
                        displayName = `${acc.name} (${acc.code})`;
                      }
                    }
                    return (
                      <option key={acc.id} value={acc.id}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={fetchOfferingsData}>조회 적용</button>
                <button className="secondary" onClick={handleExcelDownload}>
                  엑셀 출력
                </button>
              </div>
            </div>
          </div>

          {/* 에러 및 로딩 노출 */}
          {offeringsError && (
            <div className="card" style={{ marginBottom: 24, color: 'var(--danger)' }}>
              조회 에러: {offeringsError}
            </div>
          )}

          {offeringsLoading && (
            <div className="card" style={{ marginBottom: 24, textAlign: 'center', padding: '40px 0' }}>
              <p className="muted" style={{ margin: 0 }}>데이터를 불러오는 중입니다...</p>
            </div>
          )}

          {/* 헌금 데이터 대시보드 뷰 */}
          {!offeringsLoading && offeringsData && (
            <div>
              {/* 요약 카드 */}
              <section className="grid grid--4" style={{ marginBottom: 24 }}>
                <StatCard title="총 헌금액" value={`${money(offeringsData.total_amount)}원`} tone="success" />
                <StatCard title="총 헌금 횟수" value={`${money(offeringsData.total_count)}건`} />
                <StatCard title="참여 인원수" value={`${money(offeringsData.unique_participants)}명`} />
                <StatCard title="1인당 평균액" value={`${money(offeringsData.average_amount_per_person)}원`} />
              </section>

              {/* 차트 영역 1: 종류별 추이 & 참여자 건수 추이 */}
              <div className="grid grid--2" style={{ marginBottom: 24 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>헌금 종류별 추이 (월별)</h3>
                  <div style={{ height: 320, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendChartData}>
                        <defs>
                          {offeringNames.map((name, index) => (
                            <linearGradient key={`grad-${name}`} id={`color-${name}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.8} />
                              <stop offset="95%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.05} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                        <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={12} formatter={(value) => `${money(value)}`} />
                        <Tooltip
                          formatter={(value) => [`${money(value)}원`]}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Legend iconType="circle" />
                        {offeringNames.map((name, index) => (
                          <Area
                            key={name}
                            type="monotone"
                            dataKey={name}
                            stackId="1"
                            stroke={COLORS[index % COLORS.length]}
                            fill={`url(#color-${name})`}
                            fillOpacity={1}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>참여자 및 참여 건수 추이</h3>
                  <div style={{ height: 320, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={offeringsData.monthly_trends || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                        <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
                        <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} formatter={(value) => `${value}건`} />
                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} formatter={(value) => `${value}명`} />
                        <Tooltip
                          formatter={(value, name) => [
                            name === 'total_count' ? `${money(value)}건` : `${money(value)}명`,
                            name === 'total_count' ? '참여 건수' : '참여자 수',
                          ]}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Legend iconType="circle" />
                        <Bar yAxisId="left" dataKey="total_count" name="total_count" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.8} />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="total_participants"
                          name="total_participants"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                          activeDot={{ r: 8 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* 차트 영역 2: 비중 도넛 및 금액 분포 */}
              <div className="grid grid--3" style={{ marginBottom: 24 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>헌금 종류별 비중</h3>
                  <div style={{ height: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={offeringsData.by_account || []}
                          dataKey="total_amount"
                          nameKey="account_name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {(offeringsData.by_account || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `${money(value)}원`}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Legend iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>회별(부서별) 비중</h3>
                  <div style={{ height: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={offeringsData.by_department || []}
                          dataKey="total_amount"
                          nameKey="department_name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {(offeringsData.by_department || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => `${money(value)}원`}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Legend iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>금액구간 분포 (건수)</h3>
                  <div style={{ height: 280, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={offeringsData.by_amount_range || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                        <XAxis dataKey="range_label" stroke="#94a3b8" fontSize={10} interval={0} />
                        <YAxis stroke="#94a3b8" fontSize={12} formatter={(value) => `${value}`} />
                        <Tooltip
                          formatter={(value, name, props) => {
                            if (props.dataKey === 'total_count') return [`${money(value)}건`, '헌금 건수'];
                            return [`${money(value)}원`, '총 금액'];
                          }}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: 8, borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        />
                        <Legend iconType="circle" />
                        <Bar dataKey="total_count" name="헌금 건수" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* 통계 요약 테이블 */}
              <section className="grid grid--2">
                <div className="card">
                  <h2 className="section-title" style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>
                    헌금 종류별 요약
                  </h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>헌금 종류</th>
                          <th style={{ textAlign: 'right' }}>총 금액</th>
                          <th style={{ textAlign: 'right' }}>건수</th>
                          <th style={{ textAlign: 'right' }}>비중</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(offeringsData.by_account || []).map((row) => (
                          <tr key={row.account_id}>
                            <td>{row.account_name}</td>
                            <td style={{ textAlign: 'right' }}>{money(row.total_amount)}원</td>
                            <td style={{ textAlign: 'right' }}>{row.total_count}건</td>
                            <td style={{ textAlign: 'right' }}>{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h2 className="section-title" style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>
                    회별(부서별) 요약
                  </h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>회(부서)</th>
                          <th style={{ textAlign: 'right' }}>총 금액</th>
                          <th style={{ textAlign: 'right' }}>건수</th>
                          <th style={{ textAlign: 'right' }}>비중</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(offeringsData.by_department || []).map((row) => (
                          <tr key={row.department_name}>
                            <td>{row.department_name}</td>
                            <td style={{ textAlign: 'right' }}>{money(row.total_amount)}원</td>
                            <td style={{ textAlign: 'right' }}>{row.total_count}건</td>
                            <td style={{ textAlign: 'right' }}>{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
