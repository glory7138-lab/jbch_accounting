'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import LedgerTabs from '../../../components/LedgerTabs';
import { apiFetch, API_BASE, formatMoney } from '../../../lib/api';
import { ledgerMenuItems } from '../../../lib/appMenus';
import { useYear } from '../../../lib/YearContext';

function money(value) {
  return formatMoney(value);
}

export default function LedgerCategoryPage({ params }) {
  const today = new Date();
  const slug = params?.category;
  const category = ledgerMenuItems.find((item) => item.slug === slug && item.slug !== 'account-codes');
  const isEditable = category?.editable ?? false;
  const { year, setYear } = useYear();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [accounts, setAccounts] = useState([]);
  const [gridRows, setGridRows] = useState([]);
  const [offeringRows, setOfferingRows] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [readOnlyRows, setReadOnlyRows] = useState([]);

  const PAGE_SIZE = 20;

  function createEmptyRow(index, categoryName) {
    let defaultDate = today.toISOString().slice(0, 10);
    if (year) {
      defaultDate = `${year}-${defaultDate.slice(5)}`;
    }
    return {
      rowId: `new-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      id: null,
      voucher_no: '',
      voucher_date: defaultDate,
      entry_type: 'expense',
      description: '',
      amount: '',
      account_id: '',
      counterparty: '',
      note: '',
      isNew: true,
      isDirty: false,
      savingStatus: null,
      message: '',
    };
  }

  useEffect(() => {
    if (isEditable && category?.name) {
      apiFetch(`/ledger/accounts?category=${encodeURIComponent(category.name)}`)
        .then(setAccounts)
        .catch((err) => setMessage(err.message));
    }
  }, [isEditable, category]);

  async function loadEntries(targetYear, targetMonth) {
    if (!category) return;
    setMessage('');
    const yearNum = Number(targetYear);
    if (!targetYear || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || targetYear.length < 4) {
      return;
    }

    const query = new URLSearchParams({ category: category.name, year: targetYear });
    if (targetMonth) query.set('month', targetMonth);
    
    try {
      const result = await apiFetch(`/ledger/entries?${query.toString()}`);

      if (isEditable) {
        // Editable mode: separate offering rows (read-only) and manual rows (editable)
        setOfferingRows(result.offering_rows || []);

        const saved = (result.manual_rows || []).map((row) => ({
          ...row,
          rowId: `saved-${row.id}`,
          isNew: false,
          isDirty: false,
          savingStatus: null,
          message: '',
          amount: String(row.amount || ''),
          account_id: row.account_id ? String(row.account_id) : '',
        }));
        
        // Append 10 empty rows for input
        for (let i = 0; i < 10; i++) {
          saved.push(createEmptyRow(saved.length, category.name));
        }
        
        setGridRows(saved);
        setReadOnlyRows([]);
      } else {
        // Read-only mode
        setOfferingRows([]);
        setGridRows([]);
        setReadOnlyRows(result.rows || []);
      }

      setCurrentPage(1);
      setActiveRowId(null);
    } catch (err) {
      setMessage(err.message);
    }
  }

  useEffect(() => {
    loadEntries(year, month);
  }, [category, year, month]);

  const exportHref = useMemo(() => {
    if (!category) return '#';
    const yearNum = Number(year);
    if (!year || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100 || year.length < 4) {
      return '#';
    }
    const query = new URLSearchParams({ category: category.name, year });
    if (month) query.set('month', month);
    return `${API_BASE}/ledger/entries.xlsx?${query.toString()}`;
  }, [category, year, month]);

  // Compute totals
  const offeringTotal = useMemo(() => offeringRows.reduce((sum, r) => sum + (r.amount || 0), 0), [offeringRows]);
  const manualIncomeTotal = useMemo(() => {
    if (!isEditable) return 0;
    return gridRows
      .filter((r) => !r.isNew && r.entry_type === 'income')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [gridRows, isEditable]);
  const manualExpenseTotal = useMemo(() => {
    if (!isEditable) return 0;
    return gridRows
      .filter((r) => !r.isNew && r.entry_type === 'expense')
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [gridRows, isEditable]);

  // Pagination for editable grid
  const totalPages = Math.ceil(gridRows.length / PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return gridRows.slice(start, start + PAGE_SIZE);
  }, [gridRows, currentPage]);

  // Pagination for read-only table
  const readOnlyTotalPages = Math.ceil(readOnlyRows.length / PAGE_SIZE) || 1;
  const paginatedReadOnlyRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return readOnlyRows.slice(start, start + PAGE_SIZE);
  }, [readOnlyRows, currentPage]);

  if (!category) {
    return <div className="card">알 수 없는 장부 구분입니다.</div>;
  }

  function hasContent(row) {
    return Boolean(
      (row.description || '').trim() ||
      row.amount ||
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
  }

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
      category_name: category.name,
      account_id: row.account_id ? Number(row.account_id) : null,
      counterparty: row.counterparty || null,
      note: row.note || null,
    };

    try {
      if (row.id) {
        // Edit existing
        await apiFetch(`/ledger/entries/${row.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setGridRows((current) =>
          current.map((r) =>
            r.rowId === row.rowId ? { ...r, isDirty: false, savingStatus: 'success', message: '수정 완료' } : r
          )
        );
      } else {
        // Create new
        const result = await apiFetch('/ledger/entries', { method: 'POST', body: JSON.stringify(payload) });
        setGridRows((current) => {
          let updated = current.map((r) =>
            r.rowId === row.rowId
              ? {
                  ...r,
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
              updated.push(createEmptyRow(updated.length, category.name));
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

  async function handleRowFocus(rowId) {
    if (activeRowId && activeRowId !== rowId) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowId);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    setActiveRowId(rowId);
  }

  async function handleFilterChange(newYear, newMonth) {
    if (activeRowId) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowId);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    setYear(newYear);
    setMonth(newMonth);
    setActiveRowId(null);
  }

  async function changePage(nextPage) {
    if (activeRowId) {
      const activeRow = gridRows.find((r) => r.rowId === activeRowId);
      if (activeRow && activeRow.isDirty && hasContent(activeRow)) {
        await saveRow(activeRow);
      }
    }
    setCurrentPage(nextPage);
    setActiveRowId(null);
  }

  async function deleteRow(row) {
    if (!row.id) {
      // Just local removal for empty rows
      setGridRows((current) => {
        let updated = current.filter((r) => r.rowId !== row.rowId);
        const newRowsCount = updated.filter((r) => r.isNew).length;
        if (newRowsCount < 10) {
          for (let i = 0; i < 10 - newRowsCount; i++) {
            updated.push(createEmptyRow(updated.length, category.name));
          }
        }
        return updated;
      });
      return;
    }

    if (!confirm('정말 이 전표를 삭제하시겠습니까?')) return;

    try {
      await apiFetch(`/ledger/entries/${row.id}`, { method: 'DELETE' });
      setGridRows((current) => {
        let updated = current.filter((r) => r.id !== row.id);
        const newRowsCount = updated.filter((r) => r.isNew).length;
        if (newRowsCount < 10) {
          for (let i = 0; i < 10 - newRowsCount; i++) {
            updated.push(createEmptyRow(updated.length, category.name));
          }
        }
        return updated;
      });
      if (activeRowId === row.rowId) setActiveRowId(null);
    } catch (err) {
      setMessage(`삭제 실패: ${err.message}`);
    }
  }

  async function saveAllDirty() {
    setMessage('모든 변경사항 저장 중...');
    let success = true;
    for (const row of gridRows) {
      if (row.isDirty && hasContent(row)) {
        const ok = await saveRow(row);
        if (!ok) success = false;
      }
    }
    if (success) {
      setMessage('일괄 저장 완료!');
    } else {
      setMessage('일부 행 저장 중 오류 발생. 각 행의 상태 표시를 확인해줘.');
    }
  }

  // ─── Read-only info message ───
  function getReadOnlyMessage() {
    if (category.slug === 'expense-view') {
      return '이 화면은 통합계정의 지출 내역을 자동으로 조회합니다.';
    }
    return '이 장부는 통합계정에서 계정코드 기반으로 자동 분류됩니다. 수정은 통합계정에서 해주세요.';
  }

  return (
    <div className="grid">
      <LedgerTabs />
      <div className="card page-hero">
        <div>
          <h2>{category.label}</h2>
          {isEditable ? (
            <p className="muted">
              헌금현황에서 등록된 수입은 자동으로 표시됩니다. 추가 수입/지출은 아래에서 직접 입력하세요.
            </p>
          ) : (
            <p className="muted">{getReadOnlyMessage()}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isEditable && <button type="button" onClick={saveAllDirty}>일괄 저장</button>}
          <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
        </div>
      </div>

      <div className="card form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label>
          월
          <select value={month} onChange={(e) => handleFilterChange(year, e.target.value)}>
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>{index + 1}월</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="helper-card">{message}</div> : null}

      {/* ─── Editable Mode ─── */}
      {isEditable && (
        <>
          {/* Offering income (read-only section) */}
          {offeringRows.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(16,185,129,0.06)' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
                  📥 헌금현황 수입 (자동)
                  <span style={{ fontWeight: 400, fontSize: '13px', marginLeft: 8, color: 'var(--muted)' }}>
                    합계: {money(offeringTotal)}
                  </span>
                </h3>
              </div>
              <div className="table-wrap" style={{ width: '100%', minWidth: 0 }}>
                <table className="weekly-entry-table" style={{ tableLayout: 'fixed', minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>일자</th>
                      <th style={{ width: '90px' }}>유형</th>
                      <th style={{ width: '150px' }}>계정코드/명</th>
                      <th style={{ width: '220px' }}>적요</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>금액 (원)</th>
                      <th style={{ width: '120px' }}>거래처</th>
                      <th style={{ width: '120px' }}>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offeringRows.map((row, idx) => (
                      <tr key={`offering-${row.id || idx}`} style={{ background: 'rgba(16,185,129,0.03)' }}>
                        <td>{row.voucher_date}</td>
                        <td><span className="status-badge status-badge--success">수입</span></td>
                        <td>{row.account_code ? `${row.account_code} · ${row.account_name || ''}` : '-'}</td>
                        <td>{row.description}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(row.amount)}</td>
                        <td>{row.counterparty || ''}</td>
                        <td className="muted" style={{ fontSize: '12px' }}>{row.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary stats for editable */}
          {(offeringRows.length > 0 || gridRows.filter(r => !r.isNew).length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div className="card" style={{ textAlign: 'center', padding: '12px' }}>
                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>수입 합계</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                  {money(offeringTotal + manualIncomeTotal)}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: '12px' }}>
                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>지출 합계</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>
                  {money(manualExpenseTotal)}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: '12px' }}>
                <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>잔액</div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {money(offeringTotal + manualIncomeTotal - manualExpenseTotal)}
                </div>
              </div>
            </div>
          )}

          {/* Manual entry grid (editable) */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                ✏️ 수동 입력 (추가 수입 / 지출)
              </h3>
            </div>
            <div className="table-wrap" style={{ width: '100%', minWidth: 0 }}>
              <table className="weekly-entry-table" style={{ tableLayout: 'fixed', minWidth: '1100px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '130px' }}>일자</th>
                    <th style={{ width: '90px' }}>유형</th>
                    <th style={{ width: '180px' }}>계정코드</th>
                    <th style={{ width: '260px' }}>적요</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>금액 (원)</th>
                    <th style={{ width: '130px' }}>거래처</th>
                    <th style={{ width: '130px' }}>비고</th>
                    <th style={{ width: '140px' }}>상태</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>삭제</th>
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
                        <select
                          className="grid-table-input"
                          value={row.account_id}
                          onChange={(e) => updateGridRow(row.rowId, { account_id: e.target.value })}
                          onFocus={() => handleRowFocus(row.rowId)}
                        >
                          <option value="">선택</option>
                          {accounts.map((account) => (
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
                          placeholder="거래처"
                          value={row.counterparty || ''}
                          onChange={(e) => updateGridRow(row.rowId, { counterparty: e.target.value })}
                          onFocus={() => handleRowFocus(row.rowId)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="grid-table-input"
                          placeholder="비고"
                          value={row.note || ''}
                          onChange={(e) => updateGridRow(row.rowId, { note: e.target.value })}
                          onFocus={() => handleRowFocus(row.rowId)}
                        />
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        {row.savingStatus === 'saving' && <span className="status-badge status-badge--saving">저장 중...</span>}
                        {row.savingStatus === 'success' && <span className="status-badge status-badge--success">{row.message || '저장됨'}</span>}
                        {row.savingStatus === 'error' && <span className="status-badge status-badge--error" title={row.message}>{row.message || '오류'}</span>}
                        {!row.savingStatus && row.isDirty && <span className="status-badge status-badge--saving">변경됨*</span>}
                        {!row.savingStatus && !row.isDirty && !row.isNew && <span className="muted" style={{ fontSize: '12px' }}>{row.voucher_no || '저장됨'}</span>}
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
            </div>

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
        </>
      )}

      {/* ─── Read-only Mode ─── */}
      {!isEditable && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.06)' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#6366f1' }}>
              🔒 조회 전용
              <span style={{ fontWeight: 400, fontSize: '13px', marginLeft: 8, color: 'var(--muted)' }}>
                {readOnlyRows.length}건 · 합계: {money(readOnlyRows.reduce((s, r) => s + (r.amount || 0), 0))}
              </span>
            </h3>
          </div>
          <div className="table-wrap" style={{ width: '100%', minWidth: 0 }}>
            <table className="weekly-entry-table" style={{ tableLayout: 'fixed', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>일자</th>
                  <th style={{ width: '80px' }}>유형</th>
                  <th style={{ width: '150px' }}>계정코드/명</th>
                  <th style={{ width: '260px' }}>적요</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>금액 (원)</th>
                  <th style={{ width: '120px' }}>거래처</th>
                  <th style={{ width: '120px' }}>비고</th>
                  <th style={{ width: '80px' }}>출처</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReadOnlyRows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                      데이터가 없습니다. 통합계정에서 먼저 헌금현황 등록 및 수입/지출을 입력해주세요.
                    </td>
                  </tr>
                )}
                {paginatedReadOnlyRows.map((row, idx) => (
                  <tr key={`ro-${row.id || idx}`}>
                    <td>{row.voucher_date}</td>
                    <td>
                      <span className={`status-badge ${row.entry_type === 'income' ? 'status-badge--success' : 'status-badge--error'}`}>
                        {row.entry_type === 'income' ? '수입' : '지출'}
                      </span>
                    </td>
                    <td>{row.account_code ? `${row.account_code} · ${row.account_name || ''}` : '-'}</td>
                    <td>{row.description}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(row.amount)}</td>
                    <td>{row.counterparty || ''}</td>
                    <td>{row.note || ''}</td>
                    <td>
                      <span className="muted" style={{ fontSize: '11px' }}>{row.source_label || ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination for read-only */}
          {readOnlyTotalPages > 1 && (
            <div className="actions" style={{ justifyContent: 'center', padding: '16px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
              <button
                type="button"
                className="secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                이전
              </button>
              <span style={{ margin: '0 16px', fontWeight: 600, fontSize: '14px' }}>
                {currentPage} / {readOnlyTotalPages} 페이지
              </span>
              <button
                type="button"
                className="secondary"
                disabled={currentPage === readOnlyTotalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
