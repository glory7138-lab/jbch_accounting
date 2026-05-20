'use client';

import { useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

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
    rowId: `row-${index}-${Date.now()}`,
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

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
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

export default function WeeklyOfferingForm({ onCreated }) {
  const today = new Date().toISOString().slice(0, 10);
  const [voucherDate, setVoucherDate] = useState(today);
  const [rows, setRows] = useState(() => Array.from({ length: ROW_COUNT }, (_, index) => createEmptyRow(index, today)));
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [lookupStates, setLookupStates] = useState({});
  const lookupTimersRef = useRef({});

  const totalAmount = useMemo(
    () => rows.reduce((sum, row) => sum + OFFERING_FIELDS.reduce((acc, field) => acc + Number(row.offerings[field.code] || 0), 0), 0),
    [rows],
  );
  const cashTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.is_transfer ? 0 : OFFERING_FIELDS.reduce((acc, field) => acc + Number(row.offerings[field.code] || 0), 0)), 0),
    [rows],
  );

  function updateRow(rowId, patch) {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  function updateOffering(rowId, code, value) {
    setRows((current) =>
      current.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              offerings: { ...row.offerings, [code]: value },
            }
          : row,
      ),
    );
  }

  function setLookupState(rowId, nextState) {
    setLookupStates((current) => ({ ...current, [rowId]: nextState }));
  }

  function applyMemberToRow(rowId, member, foundBy = 'member_no') {
    updateRow(rowId, {
      member_id: String(member.id),
      envelope_no: member.member_no || '',
      member_name: member.name || '',
      department_name: member.department_name || '',
      district_name: memberDistrict(member),
    });
    setLookupState(rowId, {
      status: 'found',
      message: memberSummary(member, foundBy) || '헌금자 정보 조회 완료',
    });
  }

  async function autoLookupMember(rowId, rawQuery, foundBy = 'member_no') {
    const query = (rawQuery || '').trim();

    if (!query) {
      if (foundBy === 'name_search') {
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
      }
      setLookupState(rowId, null);
      return;
    }

    setLookupState(rowId, { status: 'loading', message: foundBy === 'name_search' ? '이름 조회 중...' : '봉투번호 조회 중...' });
    try {
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(query)}`);
      if (result.found && result.member) {
        applyMemberToRow(rowId, result.member, result.found_by || foundBy);
        return;
      }

      if (foundBy === 'name_search') {
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' });
        setLookupState(rowId, { status: 'missing', message: '일치하는 이름 없음' });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
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
        updateRow(rowId, { member_id: '', department_name: '', district_name: '' });
      } else {
        updateRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
      }
      setLookupState(rowId, null);
      return;
    }

    lookupTimersRef.current[rowId] = setTimeout(() => {
      autoLookupMember(rowId, trimmedValue, foundBy);
      delete lookupTimersRef.current[rowId];
    }, 300);
  }

  function handleEnvelopeChange(rowId, value) {
    updateRow(rowId, { envelope_no: value });
    queueLookup(rowId, value, 'member_no');
  }

  function handleMemberNameChange(rowId, value) {
    updateRow(rowId, { member_name: value });
    queueLookup(rowId, value, 'name_search');
  }

  async function handleMemberSearch() {
    const query = memberSearchQuery.trim();
    if (!query) {
      setMemberSearchResults([]);
      return;
    }
    if (!activeRowId) {
      alert('먼저 적용할 행의 이름 칸이나 봉투번호 칸을 한 번 클릭해줘.');
      return;
    }
    setSearchLoading(true);
    try {
      const results = await apiFetch(`/accounts/member-search?query=${encodeURIComponent(query)}`);
      setMemberSearchResults(results);
    } catch (error) {
      alert(`이름 검색 실패: ${error.message}`);
    } finally {
      setSearchLoading(false);
    }
  }

  function applyMemberToActiveRow(member) {
    if (!activeRowId) return;
    applyMemberToRow(activeRowId, member, 'name_search');
    setMemberSearchResults([]);
    setMemberSearchQuery('');
  }

  function addRows(count = 5) {
    setRows((current) => [
      ...current,
      ...Array.from({ length: count }, (_, index) => createEmptyRow(current.length + index, voucherDate)),
    ]);
  }

  function clearRows() {
    Object.values(lookupTimersRef.current).forEach(clearTimeout);
    lookupTimersRef.current = {};
    setRows(Array.from({ length: ROW_COUNT }, (_, index) => createEmptyRow(index, voucherDate)));
    setResultMessage('');
    setMemberSearchResults([]);
    setLookupStates({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        rows: rows
          .map((row) => ({
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
                .map(([code, value]) => [code, Number(value)]),
            ),
          }))
          .filter((row) => Object.keys(row.offerings).length > 0),
      };

      const result = await apiFetch('/vouchers/weekly-offering/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResultMessage(`일괄 등록 완료, ${result.created_count}건 생성, 총 ${money(result.total_amount)}원`);
      clearRows();
      onCreated?.();
    } catch (error) {
      alert(`주간 헌금 일괄 등록 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card weekly-offering-form" onSubmit={handleSubmit}>
      <div className="section-header">
        <div>
          <h2>주간 헌금 일괄 등록</h2>
          <p className="muted">봉투번호나 이름 일부만 넣어도 이름, 회별, 구역을 자동으로 채우고, 헌금 항목은 한 화면에서 다 보이게 묶었어.</p>
        </div>
        <div className="voucher-form__badge">빠른 탭 입력</div>
      </div>

      <div className="weekly-toolbar">
        <label>
          기준 날짜
          <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        </label>
        <label>
          활성 행에 이름 검색
          <div className="inline-row">
            <input value={memberSearchQuery} onChange={(e) => setMemberSearchQuery(e.target.value)} placeholder="예: 형석, 청년" />
            <button type="button" className="secondary" onClick={handleMemberSearch} disabled={searchLoading}>
              {searchLoading ? '검색 중...' : '이름 검색'}
            </button>
          </div>
        </label>
        <div className="weekly-toolbar__summary helper-card">
          <div><strong>총 합계</strong><br />{money(totalAmount)}원</div>
          <div><strong>현금 합계</strong><br />{money(cashTotal)}원</div>
        </div>
      </div>

      {memberSearchResults.length ? (
        <div className="helper-card">
          <strong>검색된 헌금자 목록, 클릭하면 현재 활성 행에 적용</strong>
          <div className="search-result-list">
            {memberSearchResults.map((member) => (
              <button key={member.id} type="button" className="search-result-item" onClick={() => applyMemberToActiveRow(member)}>
                <span>{member.name}</span>
                <span className="muted">
                  번호 {member.member_no || '-'} · {member.department_name || '소속 없음'}
                  {memberDistrict(member) ? ` · ${memberDistrict(member)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
              <th>합계</th>
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
                        onFocus={() => setActiveRowId(row.rowId)}
                        onChange={(e) => handleEnvelopeChange(row.rowId, e.target.value)}
                        onBlur={() => autoLookupMember(row.rowId, row.envelope_no, 'member_no')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            autoLookupMember(row.rowId, row.envelope_no, 'member_no');
                          }
                        }}
                        placeholder={`${index + 1}`}
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
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => handleMemberNameChange(row.rowId, e.target.value)}
                      onBlur={() => autoLookupMember(row.rowId, row.member_name, 'name_search')}
                      placeholder="이름 일부 가능"
                    />
                  </td>
                  <td>
                    <input
                      value={row.department_name}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { department_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={row.district_name}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { district_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.is_transfer}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { is_transfer: e.target.checked })}
                    />
                  </td>
                  <td className="offerings-cell">
                    <div className="offering-grid">
                      {OFFERING_FIELDS.map((field) => (
                        <label key={field.code} className="offering-input">
                          <span>{field.label}</span>
                          <input
                            type="number"
                            min="0"
                            value={row.offerings[field.code]}
                            onFocus={() => setActiveRowId(row.rowId)}
                            onChange={(e) => updateOffering(row.rowId, field.code, e.target.value)}
                            placeholder="0"
                          />
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      value={row.note}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { note: e.target.value })}
                    />
                  </td>
                  <td><strong>{money(rowTotal)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? '일괄 등록 중...' : '주간 헌금 일괄 등록'}</button>
        <button type="button" className="secondary" onClick={() => addRows(10)}>행 10개 추가</button>
        <button type="button" className="secondary" onClick={clearRows}>전체 비우기</button>
      </div>

      {resultMessage ? <div className="helper-card">{resultMessage}</div> : null}
    </form>
  );
}
