'use client';

import { useEffect, useState } from 'react';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE, formatMoney } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

function money(value) {
  return formatMoney(value);
}

export default function IndividualOfferingPage() {
  const { year } = useYear();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [startYm, setStartYm] = useState('');
  const [endYm, setEndYm] = useState('');

  useEffect(() => {
    if (year) {
      setStartYm(`${year}-01`);
      setEndYm(`${year}-12`);
    }
  }, [year]);

  // 성도 목록 검색 함수
  async function handleSearch(queryVal = searchQuery) {
    setSearchLoading(true);
    setError('');
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('individual_query', queryVal);
    }
    try {
      const res = await apiFetch(`/offerings/individual?query=${encodeURIComponent(queryVal)}`);
      if (res.search_mode) {
        setSearchResults(res.results);
      }
    } catch (err) {
      setError(`성도 검색 실패: ${err.message}`);
    } finally {
      setSearchLoading(false);
    }
  }

  // 성도 상세 정보 가져오기
  async function loadDetail(personId, sYm = startYm, eYm = endYm) {
    setDetailLoading(true);
    setError('');
    try {
      let url = `/offerings/individual?person_id=${personId}`;
      if (sYm) url += `&start_ym=${encodeURIComponent(sYm)}`;
      if (eYm) url += `&end_ym=${encodeURIComponent(eYm)}`;
      const res = await apiFetch(url);
      if (!res.search_mode) {
        setDetailData(res);
      }
    } catch (err) {
      setError(`상세 정보 조회 실패: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  }

  // 초기 로딩 (세션 데이터 복원)
  useEffect(() => {
    let restoredQuery = '';
    let restoredPersonId = null;
    let restoredStartYm = '';
    let restoredEndYm = '';
    if (typeof window !== 'undefined') {
      restoredQuery = sessionStorage.getItem('individual_query') || '';
      restoredPersonId = sessionStorage.getItem('individual_selected_person_id');
      restoredStartYm = sessionStorage.getItem('individual_start_ym') || '';
      restoredEndYm = sessionStorage.getItem('individual_end_ym') || '';
      if (restoredQuery) setSearchQuery(restoredQuery);
      if (restoredPersonId) setSelectedPersonId(restoredPersonId);
      if (restoredStartYm) setStartYm(restoredStartYm);
      if (restoredEndYm) setEndYm(restoredEndYm);
    }
    handleSearch(restoredQuery);
    setIsInitialized(true);
  }, []);

  // 조회 연월 조건 변경 시 세션 스토리지 보존
  useEffect(() => {
    if (!isInitialized) return;
    if (typeof window !== 'undefined') {
      if (startYm) {
        sessionStorage.setItem('individual_start_ym', startYm);
      } else {
        sessionStorage.removeItem('individual_start_ym');
      }
    }
  }, [startYm, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    if (typeof window !== 'undefined') {
      if (endYm) {
        sessionStorage.setItem('individual_end_ym', endYm);
      } else {
        sessionStorage.removeItem('individual_end_ym');
      }
    }
  }, [endYm, isInitialized]);

  // 성도 선택 시 상세 정보 요청 및 세션 저장
  useEffect(() => {
    if (!isInitialized) return;

    if (selectedPersonId) {
      loadDetail(selectedPersonId, startYm, endYm);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('individual_selected_person_id', selectedPersonId);
      }
    } else {
      setDetailData(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('individual_selected_person_id');
      }
    }
  }, [selectedPersonId, isInitialized, startYm, endYm]);

  // 카테고리별/연도별 퍼센트 계산을 위한 도우미
  const maxCategoryAmount = detailData?.category_summary
    ? Math.max(...Object.values(detailData.category_summary), 1)
    : 1;

  const maxAnnualAmount = detailData?.annual_summary
    ? Math.max(...Object.values(detailData.annual_summary), 1)
    : 1;

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />

      <div className="card page-hero" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: 'white', border: 'none', padding: '24px' }}>
        <div>
          <h2 style={{ color: 'white', margin: 0, fontSize: '24px' }}>개인별 헌금 내역</h2>
          <p style={{ color: '#bfdbfe', margin: '6px 0 0 0', fontSize: '14px' }}>성도 개인을 고유 키로 식별하여 연도별 봉투번호 변경에 무관하게 모든 헌금 내역을 통합 추적하고 분석합니다.</p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: '#fef2f2', color: '#991b1b', padding: '12px 16px' }}>
          <strong>오류 발생:</strong> {error}
        </div>
      )}

      {/* 메인 2컬럼 레이아웃 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* 왼쪽 사이드바: 성도 검색 및 선택 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '600px', padding: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>성도 목록</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="성도 이름 입력"
              style={{ flex: 1, padding: '10px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}
            />
            <button type="submit" style={{ padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>검색</button>
          </form>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '520px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
            {searchLoading ? (
              <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>검색 중...</div>
            ) : searchResults.length === 0 ? (
              <div className="muted" style={{ textAlign: 'center', padding: '20px', fontSize: '13px' }}>검색 결과가 없습니다.</div>
            ) : (
              searchResults.map((person) => {
                const isSelected = selectedPersonId === person.person_id;
                return (
                  <button
                    key={person.person_id}
                    onClick={() => setSelectedPersonId(person.person_id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.08)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{person.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {person.person_id}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
                      {person.department_name || '소속 없음'} · {person.district_name || '구역 없음'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 오른쪽 컨텐츠: 상세 정보 및 통계 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {detailLoading ? (
            <div className="card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
              <div className="muted">성도 데이터를 불러오는 중입니다...</div>
            </div>
          ) : !detailData ? (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '600px', border: '2px dashed var(--border)', background: 'transparent' }}>
              <span style={{ fontSize: '48px', marginBottom: '16px' }}>👤</span>
              <h3 style={{ margin: 0, color: 'var(--muted)' }}>조회할 성도를 선택해 주세요</h3>
              <p className="muted" style={{ margin: '8px 0 0 0', fontSize: '14px' }}>왼쪽 성도 목록에서 성도를 선택하면 상세 연도별 봉투 이력과 헌금 통계가 표시됩니다.</p>
            </div>
          ) : (
            <>
              {/* 성도 요약 및 봉투 이력 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>성도 통합 프로필</span>
                    <h2 style={{ margin: '4px 0 0 0', fontSize: '24px', fontWeight: '800' }}>{detailData.name} 성도님</h2>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <a
                      href={`${API_BASE}/offerings/individual.xlsx?person_id=${detailData.person_id}${startYm ? `&start_ym=${startYm}` : ''}${endYm ? `&end_ym=${endYm}` : ''}`}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: '#10b981',
                        color: 'white',
                        fontWeight: '600',
                        textDecoration: 'none',
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)'
                      }}
                    >
                      <span>📥</span> 엑셀 다운로드
                    </a>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="muted" style={{ fontSize: '13px' }}>고유 식별자:</span>
                      <span className="code" style={{ fontSize: '13px' }}>{detailData.person_id}</span>
                    </div>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--muted)' }}>연도별 봉투 및 소속 변동 이력</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {detailData.history.map((hist) => (
                      <div
                        key={hist.year}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          minWidth: '130px'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--muted)' }}>
                          🗓️ {hist.year}년 봉투
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--primary)', margin: '2px 0' }}>
                          {hist.member_no ? `${hist.member_no}번` : '번호 없음'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {hist.department_name || '부서없음'} / {hist.district_name || '구역없음'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 조회 기간 설정 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>📅</span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>조회 기간 설정</h3>
                  </div>
                  {(startYm || endYm) && (
                    <button
                      onClick={() => {
                        setStartYm('');
                        setEndYm('');
                      }}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
                      onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
                    >
                      기간 초기화
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="month"
                      value={startYm}
                      onChange={(e) => setStartYm(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <span style={{ color: 'var(--muted)', fontSize: '14px' }}>부터</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="month"
                      value={endYm}
                      onChange={(e) => setEndYm(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <span style={{ color: 'var(--muted)', fontSize: '14px' }}>까지</span>
                  </div>
                  {(startYm || endYm) && (
                    <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: '600', marginLeft: 'auto' }}>
                      ⚡ 설정한 기간의 내역만 통계에 반영됩니다
                    </span>
                  )}
                </div>
              </div>

              {/* 통계 요약 카드 (3열) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                <div className="card" style={{ background: '#eff6ff', borderColor: '#bfdbfe', padding: '20px' }}>
                  <div className="stat-card__title" style={{ color: '#1e40af', fontWeight: '600' }}>총 누적 헌금액</div>
                  <div className="stat-card__value" style={{ color: '#1d4ed8', fontSize: '24px', fontWeight: '800' }}>{money(detailData.total_amount)}원</div>
                  <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '6px' }}>전체 연도 통합 합계</div>
                </div>

                <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', padding: '20px' }}>
                  <div className="stat-card__title" style={{ color: '#166534', fontWeight: '600' }}>총 헌금 횟수</div>
                  <div className="stat-card__value" style={{ color: '#15803d', fontSize: '24px', fontWeight: '800' }}>{detailData.vouchers?.length || 0}회</div>
                  <div style={{ fontSize: '12px', color: '#166534', marginTop: '6px' }}>기록된 전체 전표 기준</div>
                </div>

                <div className="card" style={{ background: '#faf5ff', borderColor: '#e9d5ff', padding: '20px' }}>
                  <div className="stat-card__title" style={{ color: '#6b21a8', fontWeight: '600' }}>참여 연도 수</div>
                  <div className="stat-card__value" style={{ color: '#7e22ce', fontSize: '24px', fontWeight: '800' }}>{detailData.history?.length || 0}개 년도</div>
                  <div style={{ fontSize: '12px', color: '#6b21a8', marginTop: '6px' }}>
                    {detailData.history && detailData.history.length > 0
                      ? `${Math.min(...detailData.history.map(h => h.year))}년 ~ ${Math.max(...detailData.history.map(h => h.year))}년`
                      : '-'}
                  </div>
                </div>
              </div>

              {/* 통계 분석 영역 (2열: 연도별 & 항목별) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
                
                {/* 연도별 통계 */}
                <div className="card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>연도별 헌금 합계</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {Object.entries(detailData.annual_summary)
                      .sort((a, b) => b[0].localeCompare(a[0])) // 최근 연도가 위로
                      .map(([yearKey, amount]) => {
                        const pct = (amount / maxAnnualAmount) * 100;
                        return (
                          <div key={yearKey} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ fontWeight: 'bold' }}>{yearKey}년도</span>
                              <span style={{ fontWeight: '600' }}>{money(amount)}원</span>
                            </div>
                            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #2563eb)', borderRadius: '4px' }} />
                            </div>
                          </div>
                        );
                      })}
                    {Object.keys(detailData.annual_summary).length === 0 && (
                      <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>헌금 내역이 없습니다.</div>
                    )}
                  </div>
                </div>

                {/* 항목별(구분) 통계 */}
                <div className="card" style={{ padding: '20px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '700' }}>헌금 종류별 집계 (상위 5개)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {Object.entries(detailData.category_summary)
                      .sort((a, b) => b[1] - a[1]) // 내림차순
                      .slice(0, 5)
                      .map(([category, amount]) => {
                        const pct = (amount / maxCategoryAmount) * 100;
                        return (
                          <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                              <span style={{ fontWeight: 'bold' }}>{category}</span>
                              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                                {money(amount)}원 ({Math.round((amount / detailData.total_amount) * 100)}%)
                              </span>
                            </div>
                            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '4px' }} />
                            </div>
                          </div>
                        );
                      })}
                    {Object.keys(detailData.category_summary).length === 0 && (
                      <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>헌금 내역이 없습니다.</div>
                    )}
                  </div>
                </div>

              </div>

              {/* 상세 헌금 내역 테이블 */}
              <div className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifycontent: 'space-between', justifyItems: 'center', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>상세 헌금 전표 내역 ({detailData.vouchers?.length || 0}건)</h3>
                  <span className="muted" style={{ fontSize: '12px' }}>최근 날짜순 정렬</span>
                </div>
                
                <div className="table-wrap" style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                  <table style={{ minWidth: '600px', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', fontWeight: '600' }}>일자</th>
                        <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', fontWeight: '600' }}>구분 (계정과목)</th>
                        <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', fontWeight: '600', textAlign: 'right' }}>금액</th>
                        <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--border)', fontWeight: '600' }}>적요 / 메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.vouchers?.map((v) => (
                        <tr key={v.id} style={{ transition: 'background-color 0.2s' }}>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{v.voucher_date}</td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                            <span style={{
                              background: '#eff6ff',
                              color: '#1e40af',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              border: '1px solid #bfdbfe'
                            }}>
                              {v.account_name || '미분류'}
                            </span>
                            {v.account_code && <span className="muted" style={{ fontSize: '11px', marginLeft: '6px' }}>({v.account_code})</span>}
                          </td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 'bold', color: 'var(--text)' }}>
                            {money(v.amount)}원
                          </td>
                          <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '13px' }}>
                            {v.description} {v.note ? ` [메모: ${v.note}]` : ''}
                          </td>
                        </tr>
                      ))}
                      {(!detailData.vouchers || detailData.vouchers.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                            등록된 헌금 내역이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          )}

        </div>

      </div>
    </div>
  );
}
