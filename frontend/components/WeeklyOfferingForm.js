'use client';

import { useMemo, useState } from 'react';
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

const ROW_COUNT = 12;

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

  async function autoLookupEnvelope(rowId) {
    const row = rows.find((item) => item.rowId === rowId);
    const key = row?.envelope_no?.trim();
    if (!key) return;
    try {
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(key)}`);
      if (result.found && result.member) {
        updateRow(rowId, {
          member_id: String(result.member.id),
          member_name: result.member.name || '',
          department_name: result.member.department_name || '',
        });
      }
    } catch (error) {
      console.error(error);
    }
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
    updateRow(activeRowId, {
      member_id: String(member.id),
      envelope_no: member.member_no || '',
      member_name: member.name || '',
      department_name: member.department_name || '',
    });
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
    setRows(Array.from({ length: ROW_COUNT }, (_, index) => createEmptyRow(index, voucherDate)));
    setResultMessage('');
    setMemberSearchResults([]);
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
          <p className="muted">봉투를 펼쳐놓고 엑셀처럼 한 줄씩 바로 넣는 화면이야. 여러 명을 한 번에 보고 저장할 수 있게 가로형으로 넓혔어.</p>
        </div>
        <div className="voucher-form__badge">가로 일괄입력</div>
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
                <span className="muted">번호 {member.member_no || '-'} · {member.department_name || '소속 없음'}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="weekly-entry-table-wrap batch-grid-wrap">
        <table className="weekly-entry-table batch-grid-table">
          <thead>
            <tr>
              <th>봉투번호</th>
              <th>이름</th>
              <th>회별</th>
              <th>구역</th>
              <th>이체</th>
              {OFFERING_FIELDS.map((field) => (
                <th key={field.code}>{field.label}<br /><span className="muted">({field.code})</span></th>
              ))}
              <th>비고</th>
              <th>행 합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowTotal = OFFERING_FIELDS.reduce((sum, field) => sum + Number(row.offerings[field.code] || 0), 0);
              return (
                <tr key={row.rowId} className={activeRowId === row.rowId ? 'active-row' : ''}>
                  <td>
                    <input
                      value={row.envelope_no}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { envelope_no: e.target.value })}
                      onBlur={() => autoLookupEnvelope(row.rowId)}
                      placeholder={`${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      value={row.member_name}
                      onFocus={() => setActiveRowId(row.rowId)}
                      onChange={(e) => updateRow(row.rowId, { member_name: e.target.value })}
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
                  {OFFERING_FIELDS.map((field) => (
                    <td key={field.code}>
                      <input
                        type="number"
                        min="0"
                        value={row.offerings[field.code]}
                        onFocus={() => setActiveRowId(row.rowId)}
                        onChange={(e) => updateOffering(row.rowId, field.code, e.target.value)}
                        placeholder="0"
                      />
                    </td>
                  ))}
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
        <button type="button" className="secondary" onClick={() => addRows(5)}>행 5개 추가</button>
        <button type="button" className="secondary" onClick={clearRows}>전체 비우기</button>
      </div>

      {resultMessage ? <div className="helper-card">{resultMessage}</div> : null}
    </form>
  );
}
