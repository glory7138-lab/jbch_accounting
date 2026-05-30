'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, formatMoney } from '../lib/api';
import { useYear } from '../lib/YearContext';

const OFFERING_FIELDS = [
  { code: '11000', label: '십일조' },
  { code: '11200', label: '주일헌금' },
  { code: '13000', label: '후원회비' },
  { code: '11400', label: '집회헌금' },
  { code: '11100', label: '감사헌금' },
  { code: '11500', label: '기타헌금' },
  { code: '11300', label: '건축헌금' },
  { code: '12000', label: '선교회비' },
  { code: '12200', label: '세계선교헌금' },
  { code: '14000', label: '사랑의헌금' },
  { code: '12100', label: '세계선교분담금' },
  { code: '23000', label: '기타수입' },
];

const ROW_COUNT = 20;

function createEmptyRow(index, voucherDate) {
  return {
    rowId: `row-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    voucher_date: voucherDate,
    envelope_no: '',
    member_id: '',
    member_name: '',
    department_name: '',
    district_name: '',
    is_transfer: false,
    note: '',
    offerings: Object.fromEntries(OFFERING_FIELDS.map((field) => [field.code, ''])),
  };
}

function formatCustomWeekly(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  
  // 원화 환산 (부동소수점 오차 방지를 위해 round 처리)
  const won = Math.round(num * 1000);
  const absWon = Math.abs(won);
  const isNegative = won < 0;
  
  let absWonStr = String(absWon).padStart(4, '0');
  const dotPos = absWonStr.length - 3;
  const integerPart = absWonStr.slice(0, dotPos);
  const fractionalPart = absWonStr.slice(dotPos);
  
  let formattedInt = '';
  let count = 0;
  for (let i = integerPart.length - 1; i >= 0; i--) {
    if (count > 0 && count % 3 === 0) {
      formattedInt = ',' + formattedInt;
    }
    formattedInt = integerPart[i] + formattedInt;
    count++;
  }
  
  return (isNegative ? '-' : '') + formattedInt + '.' + fractionalPart;
}

function money(value) {
  return formatCustomWeekly(value);
}

function formatWithCommas(val) {
  if (val === undefined || val === null || val === '') return '';
  return formatCustomWeekly(val);
}

function memberDistrict(member) {
  return member?.district_name || member?.gender_or_section || member?.age_or_class || '';
}

function memberSummary(member, foundBy) {
  const parts = [member?.name, member?.department_name, memberDistrict(member)].filter(Boolean);
  if (foundBy === 'partial_match') {
    parts.push('부분일치');
  }
  return parts.join(' · ');
}

function normalizeLoadedRows(rows, voucherDate) {
  const normalized = (rows || []).map((row, index) => ({
    rowId: `saved-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    voucher_date: voucherDate,
    envelope_no: row.envelope_no || '',
    member_id: row.member_id ? String(row.member_id) : '',
    member_name: row.member_name || '',
    department_name: row.department_name || '',
    district_name: row.district_name || '',
    is_transfer: Boolean(row.is_transfer),
    note: row.note || '',
    offerings: Object.fromEntries(
      OFFERING_FIELDS.map((field) => {
        const rawWon = row.offerings?.[field.code];
        // 디비의 원화 정수 금액을 1000으로 나누어 천원 단위 문자열로 변환
        const thousandVal = rawWon ? String(Number(rawWon) / 1000) : '';
        return [field.code, thousandVal];
      }),
    ),
  }));

  while (normalized.length < ROW_COUNT) {
    normalized.push(createEmptyRow(normalized.length, voucherDate));
  }
  return normalized;
}

function hasRowContent(row) {
  return Boolean(
    (row.envelope_no || '').trim() ||
      (row.member_name || '').trim() ||
      (row.note || '').trim() ||
      row.is_transfer ||
      OFFERING_FIELDS.some((field) => Number(row.offerings[field.code] || 0) > 0),
  );
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
    if (value) {
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
  }, [value]);

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
      <style>{`
        .custom-calendar-popover {
          animation: calendarFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes calendarFadeIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
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
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = '#94a3b8';
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = 'var(--border, #cbd5e1)';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        }}
      >
        <span>{value}</span>
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
              transformOrigin: 'top left'
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
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseOver={(e) => e.target.style.background = '#edf2f7'}
                onMouseOut={(e) => e.target.style.background = '#f8fafc'}
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
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseOver={(e) => e.target.style.background = '#edf2f7'}
                onMouseOut={(e) => e.target.style.background = '#f8fafc'}
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
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
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
                      outline: 'none',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 4px 6px -1px rgba(37, 99, 235, 0.3)' : 'none'
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f1f5f9';
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
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
                          boxShadow: isSelected ? 'none' : '0 0 2px rgba(37, 99, 235, 0.5)'
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

export default function WeeklyOfferingForm({ voucherDate }) {
  const router = useRouter();
  const { year } = useYear();
  const [rows, setRows] = useState(() => normalizeLoadedRows([], voucherDate));
  const [activeRowId, setActiveRowId] = useState(null);
  const [activeCell, setActiveCell] = useState(null); // { rowId, code }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year && voucherDate) {
      const urlYear = voucherDate.split('-')[0];
      if (urlYear !== year) {
        const dateParts = voucherDate.split('-');
        dateParts[0] = year;
        const nextDate = dateParts.join('-');
        router.push(`/offerings/weekly/${nextDate}`);
      }
    }
  }, [year, voucherDate, router]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lookupStates, setLookupStates] = useState({});
  const lookupTimersRef = useRef({});
  const activeRowRef = useRef(null);
  const dirtyRef = useRef(false);
  const [weeklyOfferingDates, setWeeklyOfferingDates] = useState([]);

  async function loadWeeklyOfferingDates() {
    try {
      const dates = await apiFetch('/vouchers/weekly-offering-dates');
      setWeeklyOfferingDates(dates || []);
    } catch (error) {
      console.error('Failed to load weekly dates:', error);
    }
  }

  useEffect(() => {
    loadWeeklyOfferingDates();
  }, []);

  const totalAmount = useMemo(
    () => rows.reduce((sum, row) => sum + OFFERING_FIELDS.reduce((acc, field) => acc + Number(row.offerings[field.code] || 0), 0), 0),
    [rows],
  );
  const cashTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.is_transfer ? 0 : OFFERING_FIELDS.reduce((acc, field) => acc + Number(row.offerings[field.code] || 0), 0)), 0),
    [rows],
  );

  function markDirty() {
    dirtyRef.current = true;
  }

  function clearDirty() {
    dirtyRef.current = false;
  }

  function updateRow(rowId, patch, options = { markDirty: true }) {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
    if (options.markDirty !== false) {
      markDirty();
    }
  }

  function updateOffering(rowId, code, value) {
    // 숫자와 소수점만 허용
    let clean = value.replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = parts[0] + '.' + parts.slice(1).join('');
    }
    setRows((current) =>
      current.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              offerings: { ...row.offerings, [code]: clean },
            }
          : row,
      ),
    );
    markDirty();
  }

  function setLookupState(rowId, nextState) {
    setLookupStates((current) => ({ ...current, [rowId]: nextState }));
  }

  function applyMemberToRow(rowId, member, foundBy = 'member_no') {
    updateRow(
      rowId,
      {
        member_id: String(member.id),
        envelope_no: member.member_no || '',
        member_name: member.name || '',
        department_name: member.department_name || '',
        district_name: memberDistrict(member),
      },
      { markDirty: true },
    );
    setLookupState(rowId, {
      status: 'found',
      message: memberSummary(member, foundBy) || '헌금자 정보 조회 완료',
    });
  }

  async function autoLookupMember(rowId, rawQuery, foundBy = 'member_no') {
    const query = (rawQuery || '').trim();

    if (!query) {
      if (foundBy === 'name_search') {
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' }, { markDirty: false });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' }, { markDirty: false });
      }
      setLookupState(rowId, null);
      return;
    }

    setLookupState(rowId, { status: 'loading', message: foundBy === 'name_search' ? '이름 조회 중...' : '봉투번호 조회 중...' });
    try {
      const year = voucherDate ? voucherDate.split('-')[0] : new Date().getFullYear();
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(query)}&year=${year}`);
      if (result.found && result.member) {
        applyMemberToRow(rowId, result.member, result.found_by || foundBy);
        return;
      }

      if (foundBy === 'name_search') {
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' }, { markDirty: false });
        setLookupState(rowId, { status: 'missing', message: '일치하는 이름 없음' });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' }, { markDirty: false });
        setLookupState(rowId, { status: 'missing', message: '일치하는 봉투번호 없음' });
      }
    } catch (error) {
      console.error(error);
      setLookupState(rowId, { status: 'missing', message: '조회 실패' });
    }
  }

  function queueLookup(rowId, value, foundBy) {
    if (lookupTimersRef.current[rowId]) {
      clearTimeout(lookupTimersRef.current[rowId]);
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      if (foundBy === 'name_search') {
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' }, { markDirty: false });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' }, { markDirty: false });
      }
      setLookupState(rowId, null);
      return;
    }

    lookupTimersRef.current[rowId] = setTimeout(() => {
      autoLookupMember(rowId, trimmedValue, foundBy);
      delete lookupTimersRef.current[rowId];
    }, 300);
  }

  function serializeRows() {
    return rows.map((row) => ({
      voucher_date: voucherDate,
      month: Number(voucherDate.slice(5, 7)),
      envelope_no: row.envelope_no.trim() || null,
      member_id: row.member_id ? Number(row.member_id) : null,
      member_name: row.member_name.trim() || null,
      department_name: row.department_name.trim() || null,
      district_name: row.district_name.trim() || null,
      is_transfer: row.is_transfer,
      note: row.note.trim() || null,
      offerings: Object.fromEntries(
        Object.entries(row.offerings)
          .filter(([, value]) => Number(value || 0) > 0)
          .map(([code, value]) => [code, Math.round(Number(value) * 1000)]),
      ),
    }));
  }

  async function loadSheet(targetDate) {
    setLoading(true);
    try {
      const result = await apiFetch(`/vouchers/weekly-offering?voucherDate=${encodeURIComponent(targetDate)}`);
      setRows(normalizeLoadedRows(result.rows || [], targetDate));
      setLookupStates({});
      setStatusMessage(result.rows?.length ? `${targetDate} 저장 내역을 불러왔어.` : `${targetDate} 저장 내역이 없어. 새로 입력하면 돼.`);
      clearDirty();
    } catch (error) {
      setStatusMessage(`불러오기 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSheet({ silent = false } = {}) {
    if (saving) return true;
    setSaving(true);
    try {
      const result = await apiFetch('/vouchers/weekly-offering', {
        method: 'PUT',
        body: JSON.stringify({ rows: serializeRows() }),
      });
      clearDirty();
      if (!silent) {
        setStatusMessage(`저장 완료, 총 ${money(result.total_amount)}원`);
      }
      loadWeeklyOfferingDates(); // Refresh calendar dots
      return true;
    } catch (error) {
      setStatusMessage(`저장 실패: ${error.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleRowFocus(rowId) {
    if (activeRowRef.current && activeRowRef.current !== rowId && dirtyRef.current) {
      const currentRow = rows.find((row) => row.rowId === activeRowRef.current);
      if (currentRow && hasRowContent(currentRow)) {
        const ok = await saveSheet({ silent: true });
        if (ok) {
          setStatusMessage(`${currentRow.member_name || currentRow.envelope_no || '이전 행'} 자동 저장됨`);
        }
      }
    }
    activeRowRef.current = rowId;
    setActiveRowId(rowId);
  }

  function handleEnvelopeChange(rowId, value) {
    updateRow(rowId, { envelope_no: value });
    queueLookup(rowId, value, 'member_no');
  }

  function handleMemberNameChange(rowId, value) {
    updateRow(rowId, { member_name: value });
    queueLookup(rowId, value, 'name_search');
  }

  function addRows(count = 10) {
    setRows((current) => [
      ...current,
      ...Array.from({ length: count }, (_, index) => createEmptyRow(current.length + index, voucherDate)),
    ]);
    markDirty();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await saveSheet();
  }

  async function handleDateChange(nextDate) {
    if (!nextDate || nextDate === voucherDate) return;
    if (dirtyRef.current) {
      const ok = await saveSheet({ silent: true });
      if (!ok) return;
    }
    router.push(`/offerings/weekly/${nextDate}`);
  }

  useEffect(() => {
    loadSheet(voucherDate);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('last_weekly_date', voucherDate);
    }
  }, [voucherDate]);

  if (loading) {
    return <div className="card">주간 헌금 내역 불러오는 중...</div>;
  }

  return (
    <form className="card weekly-offering-form" onSubmit={handleSubmit}>
      <div className="section-header">
        <div>
          <h2>주간 헌금 일괄 등록</h2>
          <p className="muted">기준 날짜를 바꾸면 해당 날짜 화면으로 이동하고, 저장된 헌금자와 금액이 바로 다시 보여져.</p>
        </div>
        <div className="voucher-form__badge">행 이동 자동저장</div>
      </div>

      <div className="weekly-toolbar weekly-toolbar--compact" style={{ overflow: 'visible' }}>
        <label style={{ overflow: 'visible' }}>
          기준 날짜
          <div style={{ marginTop: '4px' }}>
            <CustomDatePicker 
              value={voucherDate} 
              onChange={handleDateChange} 
              existingDates={weeklyOfferingDates} 
            />
          </div>
        </label>
        <div className="helper-card weekly-toolbar__status">
          <strong>상태</strong>
          <div className="muted">{statusMessage || '입력 대기 중'}</div>
        </div>
        <div className="weekly-toolbar__summary helper-card">
          <div><strong>총 합계</strong><br />{money(totalAmount)}원</div>
          <div><strong>현금 합계</strong><br />{money(cashTotal)}원</div>
        </div>
      </div>

      <div className="weekly-entry-table-wrap batch-grid-wrap">
        <table className="weekly-entry-table batch-grid-table">
          <colgroup>
            <col style={{ width: '88px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '72px' }} />
            <col style={{ width: '72px' }} />
            <col style={{ width: '56px' }} />
            <col style={{ width: '620px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '96px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>봉투</th>
              <th>이름</th>
              <th>회별</th>
              <th>구역</th>
              <th>이체</th>
              <th>헌금 항목</th>
              <th>비고</th>
              <th className="text-right">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowTotal = OFFERING_FIELDS.reduce((sum, field) => sum + Number(row.offerings[field.code] || 0), 0);
              return (
                <tr key={row.rowId} className={activeRowId === row.rowId ? 'active-row' : ''}>
                  <td>
                    <div className="envelope-cell">
                      <input
                        value={row.envelope_no}
                        onFocus={() => handleRowFocus(row.rowId)}
                        onChange={(e) => handleEnvelopeChange(row.rowId, e.target.value)}
                        onBlur={() => autoLookupMember(row.rowId, row.envelope_no, 'member_no')}
                        placeholder=""
                      />
                      {lookupStates[row.rowId]?.message ? (
                        <div className={`lookup-hint lookup-hint--${lookupStates[row.rowId]?.status || 'idle'}`}>
                          {lookupStates[row.rowId].message}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <input
                      value={row.member_name}
                      onFocus={() => handleRowFocus(row.rowId)}
                      onChange={(e) => handleMemberNameChange(row.rowId, e.target.value)}
                      onBlur={() => autoLookupMember(row.rowId, row.member_name, 'name_search')}
                      placeholder={index === 0 ? '이름 일부 가능' : ''}
                    />
                  </td>
                  <td>
                    <input value={row.department_name} readOnly className="readonly-input" tabIndex={-1} />
                  </td>
                  <td>
                    <input value={row.district_name} readOnly className="readonly-input" tabIndex={-1} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_transfer}
                      onFocus={() => handleRowFocus(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { is_transfer: e.target.checked })}
                    />
                  </td>
                  <td className="offerings-cell">
                    <div className="offering-grid">
                      {OFFERING_FIELDS.map((field) => {
                        const isEditing = activeCell && activeCell.rowId === row.rowId && activeCell.code === field.code;
                        const displayValue = isEditing ? row.offerings[field.code] : formatWithCommas(row.offerings[field.code]);
                        return (
                          <label key={field.code} className="offering-input">
                            <span>{field.label}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={displayValue}
                              onFocus={() => {
                                handleRowFocus(row.rowId);
                                setActiveCell({ rowId: row.rowId, code: field.code });
                              }}
                              onBlur={() => {
                                setActiveCell(null);
                              }}
                              onChange={(e) => updateOffering(row.rowId, field.code, e.target.value)}
                              placeholder="0"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <input
                      value={row.note}
                      onFocus={() => handleRowFocus(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { note: e.target.value })}
                    />
                  </td>
                  <td className="text-right"><strong>{money(rowTotal)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="weekly-footer-bar">
        <div className="actions">
          <button type="button" className="secondary" onClick={() => addRows(10)}>
            + 10개 행 추가
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '저장 중...' : '전체 저장'}
          </button>
        </div>
        <div className="weekly-footer-bar__totals helper-card">
          <div>
            <strong>현금 합계</strong>
            <br />
            {money(cashTotal)}원
          </div>
          <div>
            <strong>총 합계</strong>
            <br />
            {money(totalAmount)}원
          </div>
        </div>
      </div>
    </form>
  );
}
