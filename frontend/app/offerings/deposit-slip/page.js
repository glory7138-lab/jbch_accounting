'use client';

import { useEffect, useState, useMemo } from 'react';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE, formatMoney } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

function money(value) {
  return formatMoney(value);
}

function CustomDatePicker({ value, onChange, existingDates }) {
  const [show, setShow] = useState(false);
  
  const parsed = useMemo(() => {
    const parts = value ? value.split('-') : [];
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      return { year: y, month: m - 1, day: d };
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
    }
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }, [value]);

  const [currentYear, setCurrentYear] = useState(parsed.year);
  const [currentMonth, setCurrentMonth] = useState(parsed.month);

  useEffect(() => {
    if (show && value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(y) && !isNaN(m)) {
          setCurrentYear(y);
          setCurrentMonth(m - 1);
        }
      } else {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          setCurrentYear(d.getFullYear());
          setCurrentMonth(d.getMonth());
        }
      }
    }
  }, [show, value]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  const daysArray = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    daysArray.push(i);
  }

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div 
        onClick={() => setShow(!show)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          borderRadius: '10px',
          border: '1px solid var(--border, #cbd5e1)',
          background: 'white',
          cursor: 'pointer',
          minWidth: '180px',
          justifyContent: 'space-between',
          userSelect: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          transition: 'all 0.2s ease',
          fontSize: '14px',
          fontWeight: '600',
          color: '#1e293b'
        }}
      >
        <span>{value || '날짜 선택'}</span>
        <span style={{ fontSize: '16px', color: '#64748b' }}>📅</span>
      </div>

      {show && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              background: 'transparent'
            }}
            onClick={() => setShow(false)}
          />
          
          <div 
            className="custom-calendar-popover"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: 0,
              zIndex: 1000,
              width: '300px',
              padding: '20px',
              borderRadius: '16px',
              background: 'white',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #f1f5f9',
              color: '#1e293b',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button 
                type="button" 
                onClick={handlePrevMonth}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  color: '#64748b',
                }}
              >
                ◀
              </button>
              <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>
                {currentYear}년 {currentMonth + 1}월
              </span>
              <button 
                type="button" 
                onClick={handleNextMonth}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  color: '#64748b',
                }}
              >
                ▶
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center', marginBottom: '10px' }}>
              {weekdays.map((w, idx) => (
                <span 
                  key={w} 
                  style={{ 
                    fontSize: '12px', 
                    fontWeight: '700', 
                    color: idx === 0 ? '#ef4444' : idx === 6 ? '#2563eb' : '#64748b',
                  }}
                >
                  {w}
                </span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {daysArray.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} />;
                }

                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasData = existingDates.includes(dateStr);
                const isSelected = value === dateStr;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(dateStr);
                      setShow(false);
                    }}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '34px',
                      width: '34px',
                      borderRadius: '50%',
                      border: 'none',
                      background: isSelected ? 'var(--primary, #2563eb)' : 'transparent',
                      color: isSelected ? 'white' : '#334155',
                      fontSize: '13px',
                      fontWeight: isSelected ? '700' : '500',
                      cursor: 'pointer',
                      margin: '0 auto',
                    }}
                  >
                    <span>{day}</span>
                    {hasData && (
                      <span 
                        style={{ 
                          position: 'absolute', 
                          bottom: '3px', 
                          width: '4px', 
                          height: '4px', 
                          borderRadius: '50%', 
                          background: isSelected ? 'white' : '#2563eb',
                        }} 
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DepositSlipPage() {
  const { year } = useYear();
  const [selectedDate, setSelectedDate] = useState('');
  const [existingDates, setExistingDates] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch available offering dates
  useEffect(() => {
    async function loadDates() {
      try {
        const dates = await apiFetch('/vouchers/weekly-offering-dates');
        setExistingDates(dates || []);
        
        // Default to the most recent date of the selected year
        if (dates && dates.length > 0) {
          const yearPrefix = year ? `${year}-` : '';
          const filtered = dates.filter(d => d.startsWith(yearPrefix));
          if (filtered.length > 0) {
            setSelectedDate(filtered[0]);
          } else {
            setSelectedDate(dates[0]);
          }
        } else {
          // Fallback to today
          setSelectedDate(new Date().toISOString().slice(0, 10));
        }
      } catch (err) {
        console.error('Failed to load offering dates:', err);
      }
    }
    loadDates();
  }, [year]);

  // 2. Fetch deposit slip data when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    setError('');
    apiFetch(`/offerings/deposit-slip?date=${selectedDate}`)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message || '데이터 로딩 실패');
        setData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedDate]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="grid">
      <style>{`
        @media print {
          /* Hide navigation elements */
          header, nav, aside, .no-print, .section-tabs, .page-hero, .toolbar-card, .footer {
            display: none !important;
          }
          
          /* Force page margins */
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          /* General layout adjustments for print */
          body, #__next, main, .grid {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          .print-slip-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .deposit-slip-box {
            border: 2px solid #000 !important;
            background: white !important;
            color: black !important;
            margin-bottom: 20px !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }

          .deposit-slip-box td, .deposit-slip-box th {
            border-color: #000 !important;
            color: black !important;
          }
          
          .deposit-slip-title {
            color: black !important;
          }
        }
      `}</style>

      <div className="no-print">
        <SectionTabs title="헌금현황" items={offeringMenuItems} />
      </div>

      <div className="page-hero card no-print">
        <div>
          <h2>입금전표 출력</h2>
          <p className="muted">주간 헌금 내역을 계정 과목별로 집계하여 금융기관 입금전표 형식으로 조회하고 인쇄할 수 있어.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            type="button" 
            onClick={handlePrint}
            style={{
              padding: '10px 20px',
              background: 'var(--primary, #2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
            }}
          >
            <span>🖨️</span> 인쇄하기
          </button>
          {selectedDate && (
            <a 
              href={`${API_BASE}/offerings/deposit-slip.xlsx?date=${selectedDate}`}
              style={{
                padding: '10px 20px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                textDecoration: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
              }}
            >
              <span>📥</span> 엑셀 다운로드
            </a>
          )}
        </div>
      </div>

      <div className="card toolbar-card no-print" style={{ overflow: 'visible' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', overflow: 'visible' }}>
          <label style={{ overflow: 'visible' }}>
            기준 날짜
            <div style={{ marginTop: '4px' }}>
              <CustomDatePicker 
                value={selectedDate} 
                onChange={setSelectedDate} 
                existingDates={existingDates} 
              />
            </div>
          </label>
          <div className="muted" style={{ fontSize: '13px', alignSelf: 'flex-end', paddingBottom: '10px' }}>
            * 파란 점이 표시된 날짜는 등록된 헌금 데이터가 있는 날짜야.
          </div>
        </div>
      </div>

      {loading && <div className="card">데이터 로딩 중...</div>}
      {error && <div className="card text-danger">로딩 실패: {error}</div>}

      {!loading && !error && data && (
        <div className="print-slip-container" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {data.items.length === 0 ? (
            <div className="card text-center muted" style={{ padding: '60px' }}>
              선택한 날짜({selectedDate})에는 등록된 헌금 내역이 없습니다.
            </div>
          ) : (
            <div 
              className="deposit-slip-box"
              style={{
                width: '100%',
                maxWidth: '800px',
                margin: '0 auto',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '30px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h1 
                    className="deposit-slip-title"
                    style={{
                      fontSize: '32px',
                      fontWeight: '800',
                      letterSpacing: '0.4em',
                      color: 'var(--primary, #2563eb)',
                      margin: 0,
                      padding: 0
                    }}
                  >
                    입금전표
                  </h1>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                    전표 No : {data.slip_no}
                  </span>
                </div>
                
                {/* Approval Box */}
                <table 
                  style={{ 
                    borderCollapse: 'collapse', 
                    border: '1px solid #cbd5e1', 
                    textAlign: 'center',
                    width: '240px',
                    fontSize: '12px'
                  }}
                >
                  <tbody>
                    <tr>
                      <td rowSpan="2" style={{ border: '1px solid #cbd5e1', width: '30px', background: '#f8fafc', fontWeight: 'bold', padding: '6px' }}>결<br/>재</td>
                      <td style={{ border: '1px solid #cbd5e1', width: '70px', padding: '4px', background: '#f8fafc', fontWeight: 'bold' }}>담 당</td>
                      <td style={{ border: '1px solid #cbd5e1', width: '70px', padding: '4px', background: '#f8fafc', fontWeight: 'bold' }}>회 계</td>
                      <td style={{ border: '1px solid #cbd5e1', width: '70px', padding: '4px', background: '#f8fafc', fontWeight: 'bold' }}>회 장</td>
                    </tr>
                    <tr style={{ height: '55px' }}>
                      <td style={{ border: '1px solid #cbd5e1' }}></td>
                      <td style={{ border: '1px solid #cbd5e1' }}></td>
                      <td style={{ border: '1px solid #cbd5e1' }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Date Information */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #334155', paddingBottom: '8px', marginBottom: '20px' }}>
                <span style={{ fontWeight: '700', fontSize: '15px' }}>
                  입금일자: <span style={{ color: '#0f172a' }}>{selectedDate}</span>
                </span>
                <span className="muted" style={{ fontSize: '13px' }}>
                  단위: 원 (KRW)
                </span>
              </div>

              {/* Items Table */}
              <table 
                style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  border: '1px solid #cbd5e1',
                  marginBottom: '20px'
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ border: '1px solid #cbd5e1', padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', width: '40%' }}>계 정 과 목</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', width: '40%' }}>금 액</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '12px 16px', textAlign: 'left', fontWeight: 'bold', width: '20%' }}>비 고</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 1 ? '#f8fafc' : 'transparent' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px 16px', fontWeight: '600' }}>
                        {item.category}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '15px', fontWeight: '500' }}>
                        {item.amount > 0 ? money(item.amount) : ''}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px 16px' }}></td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '12px 16px', fontSize: '16px' }}>
                      합 계
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '16px' }}>
                      {money(data.total_amount)}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '12px 16px' }}></td>
                  </tr>
                </tbody>
              </table>

              {/* Bottom Church Info */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '40px', padding: '10px 0' }}>
                <span 
                  style={{ 
                    fontSize: '18px', 
                    fontWeight: '800', 
                    letterSpacing: '0.15em', 
                    color: '#334155',
                    borderBottom: '1px solid #cbd5e1',
                    paddingBottom: '4px'
                  }}
                >
                  대한예수교침례회 창원교회
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
