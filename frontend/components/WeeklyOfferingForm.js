'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
      OFFERING_FIELDS.map((field) => [field.code, row.offerings?.[field.code] ? String(row.offerings[field.code]) : '']),
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

export default function WeeklyOfferingForm({ voucherDate }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => normalizeLoadedRows([], voucherDate));
  const [activeRowId, setActiveRowId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lookupStates, setLookupStates] = useState({});
  const lookupTimersRef = useRef({});
  const activeRowRef = useRef(null);
  const dirtyRef = useRef(false);

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
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(query)}`);
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
          .map(([code, value]) => [code, Number(value)]),
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

      <div className="weekly-toolbar weekly-toolbar--compact">
        <label>
          기준 날짜
          <input type="date" value={voucherDate} onChange={(e) => handleDateChange(e.target.value)} />
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
                      {OFFERING_FIELDS.map((field) => (
                        <label key={field.code} className="offering-input">
                          <span>{field.label}</span>
                          <input
                            type="number"
                            min="0"
                            value={row.offerings[field.code]}
                            onFocus={() => handleRowFocus(row.rowId)}
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
                      onFocus={() => handleRowFocus(row.rowId)}
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

      <div className="weekly-footer-bar helper-card">
        <div className="weekly-footer-bar__totals">
          <div><strong>총 합계</strong><br />{money(totalAmount)}원</div>
          <div><strong>현금 합계</strong><br />{money(cashTotal)}원</div>
        </div>
        <div className="actions">
          <button type="submit" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
          <button type="button" className="secondary" onClick={() => addRows(10)}>행 10개 추가</button>
        </div>
      </div>
    </form>
  );
}
