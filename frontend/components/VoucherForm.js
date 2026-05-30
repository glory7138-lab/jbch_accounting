'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportButtons from './ExportButtons';
import { apiFetch, API_BASE, formatMoney } from '../lib/api';
import { useYear } from '../lib/YearContext';

function money(value) {
  return formatMoney(value);
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

export default function VoucherForm() {
  const today = new Date();
  const { year, setYear } = useYear();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [accounts, setAccounts] = useState([]);
  const [funds, setFunds] = useState([]);
  const [gridRows, setGridRows] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [accountFilter, setAccountFilter] = useState('');

  const [lookupStates, setLookupStates] = useState({});
  const lookupTimersRef = useRef({});
  const activeRowRef = useRef(null);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const PAGE_SIZE = 20;

  function createEmptyRow(index) {
    let defaultDate = today.toISOString().slice(0, 10);
    if (year) {
      defaultDate = `${year}-${defaultDate.slice(5)}`;
    }
    return {
      rowId: `new-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      id: null,
      voucher_no: '',
      voucher_date: defaultDate,
      entry_type: 'income',
      description: '',
      amount: '',
      fund_name: '',
      account_id: '',
      member_id: '',
      envelope_no: '',
      member_name: '',
      department_name: '',
      district_name: '',
      counterparty: '',
      note: '',
      isNew: true,
      isDirty: false,
      savingStatus: null,
      message: '',
    };
  }

  // Load basic codes (accounts, funds)
  useEffect(() => {
    Promise.all([apiFetch('/accounts'), apiFetch('/accounts/funds')])
      .then(([accountsData, fundsData]) => {
        setAccounts(accountsData);
        setFunds(fundsData);
      })
      .catch((err) => setMessage(`코드 정보 로드 실패: ${err.message}`));
  }, []);

  // Filter accounts based on global accountFilter text
  const filteredAccounts = useMemo(() => {
    const keyword = accountFilter.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) => {
      const haystack = [
        account.code,
        account.name,
        account.report_category,
        account.account_type,
        account.finance_category,
        account.middle_category,
        account.major_category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [accounts, accountFilter]);

  // Load vouchers for target year/month
  async function loadVouchers(targetYear, targetMonth) {
    setMessage('');
    const yearNum = Number(targetYear);
    if (!targetYear || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || targetYear.length < 4) {
      return;
    }

    try {
      const query = new URLSearchParams({ year: targetYear });
      if (targetMonth) query.set('month', targetMonth);
      // Fetch 1000 limit to get enough data for current month
      query.set('limit', '1000');

      const result = await apiFetch(`/vouchers?${query.toString()}`);
      
      const initialLookupStates = {};
      const saved = (result || []).map((row) => {
        const rowId = `saved-${row.id}`;
        
        let envelope_no = '';
        let member_id = '';
        let member_name = '';
        let department_name = '';
        let district_name = '';

        if (row.member) {
          envelope_no = row.member.member_no || '';
          member_id = String(row.member.id);
          member_name = row.member.name || '';
          department_name = row.member.department_name || '';
          district_name = memberDistrict(row.member);
          
          initialLookupStates[rowId] = {
            status: 'found',
            message: memberSummary(row.member, 'member_no'),
          };
        }

        return {
          rowId,
          id: row.id,
          voucher_no: row.voucher_no,
          voucher_date: row.voucher_date,
          entry_type: row.entry_type,
          description: row.description,
          amount: String(row.amount || ''),
          fund_name: row.fund_name || '',
          account_id: row.account_id ? String(row.account_id) : '',
          member_id,
          envelope_no,
          member_name,
          department_name,
          district_name,
          counterparty: row.counterparty || '',
          note: row.note || '',
          isNew: false,
          isDirty: false,
          savingStatus: null,
          message: '',
        };
      });

      // Append 10 empty rows
      for (let i = 0; i < 10; i++) {
        saved.push(createEmptyRow(saved.length));
      }

      setGridRows(saved);
      setLookupStates(initialLookupStates);
      setCurrentPage(1);
      setActiveRowId(null);
      activeRowRef.current = null;
      dirtyRef.current = false;
    } catch (err) {
      setMessage(`불러오기 실패: ${err.message}`);
    }
  }

  useEffect(() => {
    loadVouchers(year, month);
  }, [year, month]);

  const exportHref = useMemo(() => {
    const yearNum = Number(year);
    if (!year || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || year.length < 4) {
      return `${API_BASE}/exports/vouchers.xlsx`;
    }
    const query = new URLSearchParams({ year });
    if (month) query.set('month', month);
    return `${API_BASE}/exports/vouchers.xlsx?${query.toString()}`;
  }, [year, month]);

  // Client-side pagination
  const totalPages = Math.ceil(gridRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return gridRows.slice(start, start + PAGE_SIZE);
  }, [gridRows, currentPage]);

  function hasContent(row) {
    return Boolean(
      (row.envelope_no || '').trim() ||
      (row.member_name || '').trim() ||
      (row.description || '').trim() ||
      row.amount ||
      (row.fund_name || '').trim() ||
      row.account_id ||
      (row.counterparty || '').trim() ||
      (row.note || '').trim()
    );
  }

  function updateGridRowState(rowId, patch) {
    setGridRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    );
  }

  function updateGridRow(rowId, patch) {
    setGridRows((current) =>
      current.map((row) => {
        if (row.rowId !== rowId) return row;
        return { ...row, ...patch, isDirty: true };
      })
    );
    dirtyRef.current = true;
  }

  function setLookupState(rowId, nextState) {
    setLookupStates((current) => ({ ...current, [rowId]: nextState }));
  }

  // Auto lookup member logic
  async function autoLookupMember(rowId, rawQuery, foundBy = 'member_no') {
    const query = (rawQuery || '').trim();
    const targetRow = gridRows.find((r) => r.rowId === rowId);
    if (!targetRow) return;

    if (!query) {
      if (foundBy === 'name_search') {
        updateGridRow(rowId, { member_id: '', department_name: '', district_name: '' });
      } else {
        updateGridRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
      }
      setLookupState(rowId, null);
      return;
    }

    setLookupState(rowId, { status: 'loading', message: foundBy === 'name_search' ? '이름 조회 중...' : '봉투번호 조회 중...' });
    try {
      const searchYear = targetRow.voucher_date ? targetRow.voucher_date.split('-')[0] : year;
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(query)}&year=${searchYear}`);
      if (result.found && result.member) {
        const member = result.member;
        updateGridRow(rowId, {
          member_id: String(member.id),
          envelope_no: member.member_no || '',
          member_name: member.name || '',
          department_name: member.department_name || '',
          district_name: memberDistrict(member),
          counterparty: targetRow.counterparty || member.name, // Auto fill counterparty
        });
        setLookupState(rowId, {
          status: 'found',
          message: memberSummary(member, result.found_by || foundBy),
        });
        return;
      }

      if (foundBy === 'name_search') {
        updateGridRow(rowId, { member_id: '', department_name: '', district_name: '' });
        setLookupState(rowId, { status: 'missing', message: '일치하는 이름 없음' });
      } else {
        updateGridRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
        setLookupState(rowId, { status: 'missing', message: '일치하는 번호 없음' });
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
        updateGridRow(rowId, { member_id: '', department_name: '', district_name: '' });
      } else {
        updateGridRow(rowId, { member_id: '', member_name: '', department_name: '', district_name: '' });
      }
      setLookupState(rowId, null);
      return;
    }

    lookupTimersRef.current[rowId] = setTimeout(() => {
      autoLookupMember(rowId, trimmedValue, foundBy);
      delete lookupTimersRef.current[rowId];
    }, 300);
  }

  // Handle account change & auto description
  function handleAccountChange(rowId, accountId) {
    const nextAccount = accounts.find((account) => String(account.id) === String(accountId));
    const nextDescription = nextAccount ? (nextAccount.report_category || nextAccount.name || nextAccount.code) : '';
    const targetRow = gridRows.find((r) => r.rowId === rowId);

    if (targetRow) {
      const shouldReplaceDescription = !targetRow.description || targetRow.description === (targetRow.autoDesc || '');
      updateGridRow(rowId, {
        account_id: accountId,
        description: shouldReplaceDescription ? nextDescription : targetRow.description,
        autoDesc: nextDescription,
      });
    }
  }

  // Save row logic
  async function saveRow(row) {
    if (!row || !row.isDirty || !hasContent(row)) return true;

    if (!row.description?.trim()) {
      updateGridRowState(row.rowId, { savingStatus: 'error', message: '적요 입력 필요' });
      return false;
    }
    const amtNum = Number(row.amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      updateGridRowState(row.rowId, { savingStatus: 'error', message: '금액 오류' });
      return false;
    }

    updateGridRowState(row.rowId, { savingStatus: 'saving', message: '저장 중...' });

    const payload = {
      voucher_date: row.voucher_date,
      entry_type: row.entry_type,
      description: row.description,
      amount: amtNum,
      fund_name: row.fund_name.trim() || null,
      account_id: row.account_id ? Number(row.account_id) : null,
      member_id: row.member_id ? Number(row.member_id) : null,
      counterparty: row.counterparty.trim() || null,
      note: row.note.trim() || null,
      lines: [],
    };

    try {
      if (row.id) {
        // Edit existing voucher
        await apiFetch(`/vouchers/${row.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setGridRows((current) =>
          current.map((r) =>
            r.rowId === row.rowId ? { ...r, isDirty: false, savingStatus: 'success', message: '수정 완료' } : r
          )
        );
      } else {
        // Create new voucher
        const result = await apiFetch('/vouchers', { method: 'POST', body: JSON.stringify(payload) });
        
        // Map next lookup state with correct key
        setLookupStates((current) => {
          const nextStates = { ...current };
          if (nextStates[row.rowId]) {
            nextStates[`saved-${result.id}`] = nextStates[row.rowId];
            delete nextStates[row.rowId];
          }
          return nextStates;
        });

        setGridRows((current) => {
          let updated = current.map((r) =>
            r.rowId === row.rowId
              ? {
                  ...r,
                  rowId: `saved-${result.id}`,
                  id: result.id,
                  voucher_no: result.voucher_no,
                  isNew: false,
                  isDirty: false,
                  savingStatus: 'success',
                  message: '등록 완료',
                }
              : r
          );
          
          const newRowsCount = updated.filter((r) => r.isNew).length;
          if (newRowsCount < 10) {
            for (let i = 0; i < 10 - newRowsCount; i++) {
              updated.push(createEmptyRow(updated.length));
            }
          }
          return updated;
        });
      }
      return true;
    } catch (err) {
      setGridRows((current) =>
        current.map((r) =>
          r.rowId === row.rowId ? { ...r, savingStatus: 'error', message: err.message } : r
        )
      );
      return false;
    }
  }

  // Row focus trigger
  async function handleRowFocus(rowId) {
    if (activeRowRef.current && activeRowRef.current !== rowId && dirtyRef.current) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowRef.current);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    activeRowRef.current = rowId;
    setActiveRowId(rowId);
  }

  // Year/Month filter change
  async function handleFilterChange(newYear, newMonth) {
    if (activeRowId && dirtyRef.current) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowId);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    setYear(newYear);
    setMonth(newMonth);
    setActiveRowId(null);
    activeRowRef.current = null;
    dirtyRef.current = false;
  }

  // Page change
  async function changePage(nextPage) {
    if (activeRowId && dirtyRef.current) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowId);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    setCurrentPage(nextPage);
    setActiveRowId(null);
    activeRowRef.current = null;
    dirtyRef.current = false;
  }

  // Delete row
  async function deleteRow(row) {
    if (!row.id) {
      setGridRows((current) => {
        let updated = current.filter((r) => r.rowId !== row.rowId);
        const newRowsCount = updated.filter((r) => r.isNew).length;
        if (newRowsCount < 10) {
          for (let i = 0; i < 10 - newRowsCount; i++) {
            updated.push(createEmptyRow(updated.length));
          }
        }
        return updated;
      });
      return;
    }

    if (!confirm('정말 이 전표를 삭제하시겠습니까?')) return;

    try {
      await apiFetch(`/vouchers/${row.id}`, { method: 'DELETE' });
      setGridRows((current) => {
        let updated = current.filter((r) => r.id !== row.id);
        const newRowsCount = updated.filter((r) => r.isNew).length;
        if (newRowsCount < 10) {
          for (let i = 0; i < 10 - newRowsCount; i++) {
            updated.push(createEmptyRow(updated.length));
          }
        }
        return updated;
      });
      if (activeRowId === row.rowId) {
        setActiveRowId(null);
        activeRowRef.current = null;
      }
    } catch (err) {
      setMessage(`삭제 실패: ${err.message}`);
    }
  }

  // Save all dirty items manually
  async function saveAllDirty() {
    setSaving(true);
    setMessage('모든 변경사항 저장 중...');
    let success = true;
    for (const row of gridRows) {
      if (row.isDirty && hasContent(row)) {
        const ok = await saveRow(row);
        if (!ok) success = false;
      }
    }
    setSaving(false);
    if (success) {
      setMessage('일괄 저장 완료!');
      dirtyRef.current = false;
    } else {
      setMessage('일부 행 저장 중 오류 발생. 각 행의 상태 표시를 확인해줘.');
    }
  }

  return (
    <div className="grid">
      <div className="card page-hero">
        <div>
          <h2>일반 전표 입력 및 조회</h2>
          <p className="muted">주간헌금 등록 화면처럼 테이블 행에서 바로 기입하고 자동 저장할 수 있어. (입력 후 다른 행을 누르면 자동저장)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={saveAllDirty} disabled={saving}>
            {saving ? '저장 중...' : '일괄 저장'}
          </button>
          <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
        </div>
      </div>

      <div className="card form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <label>
          월
          <select value={month} onChange={(e) => handleFilterChange(year, e.target.value)}>
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>{index + 1}월</option>
            ))}
          </select>
        </label>
        <label>
          계정 필터
          <input
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            placeholder="코드 또는 계정명 검색"
          />
        </label>
      </div>

      {message ? <div className="helper-card">{message}</div> : null}

      {/* Spreadsheet Grid Table */}
      <div className="card table-wrap" style={{ width: '100%', minWidth: 0, padding: 0 }}>
        <table className="weekly-entry-table" style={{ tableLayout: 'fixed', minWidth: '1500px' }}>
          <colgroup>
            <col style={{ width: '130px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '220px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '70px' }} />
          </colgroup>
          <thead>
            <tr>
              <th>일자</th>
              <th>유형</th>
              <th>봉투번호</th>
              <th>헌금자</th>
              <th>회별/부서</th>
              <th>구역</th>
              <th>헌금항목(기금)</th>
              <th>세부 계정</th>
              <th>적요</th>
              <th style={{ textAlign: 'right' }}>금액 (원)</th>
              <th>상대방/거래처</th>
              <th>비고</th>
              <th>상태</th>
              <th style={{ textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row) => (
              <tr 
                key={row.rowId}
                style={{ background: activeRowId === row.rowId ? '#f8fbff' : 'transparent' }}
              >
                <td>
                  <input
                    type="date"
                    className="grid-table-input"
                    value={row.voucher_date}
                    onChange={(e) => updateGridRow(row.rowId, { voucher_date: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  />
                </td>
                <td>
                  <select
                    className="grid-table-input"
                    value={row.entry_type}
                    onChange={(e) => updateGridRow(row.rowId, { entry_type: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  >
                    <option value="income">수입</option>
                    <option value="expense">지출</option>
                  </select>
                </td>
                <td>
                  <div className="envelope-cell" style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="grid-table-input"
                      value={row.envelope_no}
                      onChange={(e) => {
                        updateGridRow(row.rowId, { envelope_no: e.target.value });
                        queueLookup(row.rowId, e.target.value, 'member_no');
                      }}
                      onFocus={() => handleRowFocus(row.rowId)}
                      placeholder=""
                    />
                    {lookupStates[row.rowId]?.message && (
                      <div
                        className={`lookup-hint lookup-hint--${lookupStates[row.rowId]?.status || 'idle'}`}
                        style={{
                          position: 'absolute',
                          bottom: '-18px',
                          left: '4px',
                          fontSize: '9px',
                          zIndex: 10,
                          whiteSpace: 'nowrap',
                          background: 'rgba(255, 255, 255, 0.95)',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                      >
                        {lookupStates[row.rowId].message}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    className="grid-table-input"
                    value={row.member_name}
                    onChange={(e) => {
                      updateGridRow(row.rowId, { member_name: e.target.value });
                      queueLookup(row.rowId, e.target.value, 'name_search');
                    }}
                    onFocus={() => handleRowFocus(row.rowId)}
                    placeholder="이름 조회"
                  />
                </td>
                <td>
                  <input value={row.department_name} readOnly className="readonly-input grid-table-input" tabIndex={-1} />
                </td>
                <td>
                  <input value={row.district_name} readOnly className="readonly-input grid-table-input" tabIndex={-1} />
                </td>
                <td>
                  <input
                    type="text"
                    className="grid-table-input"
                    list={`funds-list-${row.rowId}`}
                    value={row.fund_name}
                    onChange={(e) => updateGridRow(row.rowId, { fund_name: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                    placeholder="기금 입력"
                  />
                  <datalist id={`funds-list-${row.rowId}`}>
                    {funds.map((f) => (
                      <option key={f.id} value={f.name} />
                    ))}
                  </datalist>
                </td>
                <td>
                  <select
                    className="grid-table-input"
                    value={row.account_id}
                    onChange={(e) => handleAccountChange(row.rowId, e.target.value)}
                    onFocus={() => handleRowFocus(row.rowId)}
                  >
                    <option value="">선택 안 함</option>
                    {filteredAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="grid-table-input"
                    placeholder="적요 입력"
                    value={row.description}
                    onChange={(e) => updateGridRow(row.rowId, { description: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="grid-table-input"
                    style={{ textAlign: 'right' }}
                    placeholder="0"
                    value={row.amount}
                    onChange={(e) => updateGridRow(row.rowId, { amount: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="grid-table-input"
                    placeholder="상대방명"
                    value={row.counterparty}
                    onChange={(e) => updateGridRow(row.rowId, { counterparty: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="grid-table-input"
                    placeholder="비고"
                    value={row.note}
                    onChange={(e) => updateGridRow(row.rowId, { note: e.target.value })}
                    onFocus={() => handleRowFocus(row.rowId)}
                  />
                </td>
                <td style={{ verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {row.savingStatus === 'saving' && <span className="status-badge status-badge--saving">저장 중...</span>}
                  {row.savingStatus === 'success' && <span className="status-badge status-badge--success">{row.message || '저장됨'}</span>}
                  {row.savingStatus === 'error' && <span className="status-badge status-badge--error" title={row.message}>{row.message || '오류'}</span>}
                  {!row.savingStatus && row.isDirty && <span className="status-badge status-badge--saving">변경됨*</span>}
                  {!row.savingStatus && !row.isDirty && !row.isNew && <span className="muted" style={{ fontSize: '10px' }}>{row.voucher_no || '저장됨'}</span>}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                  <button
                    type="button"
                    className="danger"
                    style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}
                    onClick={() => deleteRow(row)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="actions" style={{ justifyContent: 'center', padding: '16px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
            <button
              type="button"
              className="secondary"
              disabled={currentPage === 1}
              onClick={() => changePage(currentPage - 1)}
            >
              이전
            </button>
            <span style={{ margin: '0 16px', fontWeight: 600, fontSize: '14px' }}>
              {currentPage} / {totalPages} 페이지
            </span>
            <button
              type="button"
              className="secondary"
              disabled={currentPage === totalPages}
              onClick={() => changePage(currentPage + 1)}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
