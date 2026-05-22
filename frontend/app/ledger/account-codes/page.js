'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import LedgerTabs from '../../../components/LedgerTabs';
import { apiFetch, API_BASE } from '../../../lib/api';

const emptyForm = {
  code: '',
  name: '',
  major_category: '',
  middle_category: '',
  report_category: '',
  account_type: '',
  finance_category: '',
  debit_account: '',
  credit_account: '',
  normal_side: '',
  is_active: true,
};

export default function AccountCodesPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 페이징 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const totalPages = useMemo(() => {
    if (pageSize === '전체') return 1;
    return Math.ceil(rows.length / pageSize) || 1;
  }, [rows, pageSize]);

  const paginatedRows = useMemo(() => {
    if (pageSize === '전체') return rows;
    const startIndex = (currentPage - 1) * pageSize;
    return rows.slice(startIndex, startIndex + pageSize);
  }, [rows, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  async function loadRows(keyword = query) {
    setLoading(true);
    try {
      const data = await apiFetch(`/ledger/account-codes${keyword ? `?query=${encodeURIComponent(keyword)}` : ''}`);
      setRows(data);
    } catch (error) {
      setMessage(`조회 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows('');
  }, []);

  const exportHref = useMemo(
    () => `${API_BASE}/ledger/account-codes.xlsx${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    [query]
  );

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      code: row.code || '',
      name: row.name || '',
      major_category: row.major_category || '',
      middle_category: row.middle_category || '',
      report_category: row.report_category || '',
      account_type: row.account_type || '',
      finance_category: row.finance_category || '',
      debit_account: row.debit_account || '',
      credit_account: row.credit_account || '',
      normal_side: row.normal_side || '',
      is_active: Boolean(row.is_active),
    });
    // 모바일에서 폼으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage('');
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!window.confirm('정말 이 계정코드를 삭제하시겠습니까?\n전표에서 사용 중인 계정은 삭제할 수 없습니다.')) {
      return;
    }
    try {
      await apiFetch(`/ledger/account-codes/${editingId}`, { method: 'DELETE' });
      setMessage('삭제 완료');
      resetForm();
      loadRows();
    } catch (error) {
      setMessage(`삭제 실패: ${error.message}`);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (editingId) {
        await apiFetch(`/ledger/account-codes/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMessage('수정 완료');
      } else {
        await apiFetch('/ledger/account-codes', { method: 'POST', body: JSON.stringify(form) });
        setMessage('등록 완료');
      }
      resetForm();
      loadRows();
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`);
    }
  }

  async function handleUpload() {
    if (!file) {
      setMessage('파일을 먼저 선택해 주세요.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/ledger/account-codes/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const result = await response.json();
      setMessage(`엑셀 업로드 완료 — 생성 ${result.created}건, 수정 ${result.updated}건`);
      setFile(null);
      loadRows();
    } catch (error) {
      setMessage(`엑셀 업로드 실패: ${error.message}`);
    }
  }

  return (
    <div className="grid">
      <LedgerTabs />

      {/* 페이지 헤더 */}
      <div className="card page-hero">
        <div>
          <h2>계정코드 관리</h2>
          <p className="muted">계정코드를 등록·수정하거나 엑셀로 일괄 업로드할 수 있어.</p>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      {/* 상단 검색 필터 */}
      <div className="card form-grid">
        <label className="form-grid__wide">
          검색어 (코드, 계정명, 분류 등)
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadRows(query)}
              placeholder="코드, 계정명, 분류 검색"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => loadRows(query)}
              style={{ whiteSpace: 'nowrap', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              조회
            </button>
          </div>
        </label>
      </div>

      {/* 메인 2컬럼 레이아웃 */}
      <div className="grid grid--2">

        {/* 왼쪽: 등록/수정 폼 */}
        <form
          className="card form-grid"
          onSubmit={handleSubmit}
          style={{ width: '100%', minWidth: 0, alignSelf: 'start' }}
        >
          <h2 style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            {editingId ? '계정코드 수정' : '계정코드 등록'}
          </h2>

          <label>
            계정코드
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="예: 11100"
              required
            />
          </label>
          <label>
            계정명
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 십일조"
              required
            />
          </label>
          <label>
            대분류
            <input
              value={form.major_category}
              onChange={(e) => setForm({ ...form, major_category: e.target.value })}
              placeholder="대분류 항목"
            />
          </label>
          <label>
            중분류
            <input
              value={form.middle_category}
              onChange={(e) => setForm({ ...form, middle_category: e.target.value })}
              placeholder="중분류 항목"
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            세부계정항목 (보고용)
            <input
              value={form.report_category}
              onChange={(e) => setForm({ ...form, report_category: e.target.value })}
              placeholder="보고서에 표시될 세부 항목명"
            />
          </label>
          <label>
            계정유형
            <input
              value={form.account_type}
              onChange={(e) => setForm({ ...form, account_type: e.target.value })}
              placeholder="예: 수입"
            />
          </label>
          <label>
            재무분류
            <input
              value={form.finance_category}
              onChange={(e) => setForm({ ...form, finance_category: e.target.value })}
              placeholder="예: 헌금"
            />
          </label>
          <label>
            차변계정
            <input
              value={form.debit_account}
              onChange={(e) => setForm({ ...form, debit_account: e.target.value })}
              placeholder="차변"
            />
          </label>
          <label>
            대변계정
            <input
              value={form.credit_account}
              onChange={(e) => setForm({ ...form, credit_account: e.target.value })}
              placeholder="대변"
            />
          </label>
          <label>
            기본방향
            <input
              value={form.normal_side}
              onChange={(e) => setForm({ ...form, normal_side: e.target.value })}
              placeholder="예: credit"
            />
          </label>
          <label className="checkbox-field">
            사용 여부
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
          </label>

          <div
            className="actions form-grid__wide"
            style={{ marginTop: '8px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}
          >
            <button type="submit" style={{ flex: 1, padding: '12px' }}>
              {editingId ? '수정 저장' : '등록'}
            </button>
            {editingId && (
              <button
                type="button"
                className="danger"
                onClick={handleDelete}
                style={{ flex: 1, padding: '12px' }}
              >
                삭제
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={resetForm}
              style={{ flex: 1, padding: '12px' }}
            >
              입력 초기화
            </button>
          </div>

          {/* 엑셀 업로드 (폼 하단에 통합) */}
          <div
            className="form-grid__wide"
            style={{
              marginTop: '8px',
              padding: '14px',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              background: '#f8fbff',
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>
              📂 엑셀 일괄 업로드
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ flex: 1, padding: '8px', fontSize: '13px' }}
              />
              <button
                type="button"
                onClick={handleUpload}
                style={{ whiteSpace: 'nowrap', padding: '10px 16px', fontSize: '13px' }}
              >
                업로드 등록
              </button>
            </div>
          </div>

          {message ? <div className="helper-card form-grid__wide">{message}</div> : null}
        </form>

        {/* 오른쪽: 목록 */}
        <div className="card table-wrap" style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 건수 + 페이지 선택 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #f1f3f5',
              paddingBottom: '8px',
            }}
          >
            <span style={{ fontSize: '13px', color: '#637083' }}>총 {rows.length}개 계정</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <span>보기:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === '전체' ? '전체' : Number(val));
                }}
                style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border)' }}
              >
                <option value={10}>10개씩</option>
                <option value={20}>20개씩</option>
                <option value={30}>30개씩</option>
                <option value={50}>50개씩</option>
                <option value="전체">전체 보기</option>
              </select>
            </div>
          </div>

          {/* 테이블 */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '90px' }}>코드</th>
                <th>계정명</th>
                <th>대분류</th>
                <th>중분류</th>
                <th>세부항목</th>
                <th style={{ width: '50px' }}>활성</th>
                <th style={{ width: '60px' }}>수정</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#637083' }}>
                    조회 중...
                  </td>
                </tr>
              ) : paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#868e96' }}>
                    등록된 계정코드가 없습니다.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="code" style={{ fontSize: '12px' }}>
                        {row.code}
                      </span>
                    </td>
                    <td>{row.name}</td>
                    <td style={{ fontSize: '12px', color: '#637083' }}>{row.major_category || '-'}</td>
                    <td style={{ fontSize: '12px', color: '#637083' }}>{row.middle_category || '-'}</td>
                    <td style={{ fontSize: '12px', color: '#637083' }}>{row.report_category || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: row.is_active ? '#0f9d58' : '#d93025',
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => startEdit(row)}
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      >
                        선택
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* 페이지네이션 */}
          {pageSize !== '전체' && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                이전
              </button>
              <span style={{ fontSize: '13px', color: '#637083', minWidth: '70px', textAlign: 'center' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
