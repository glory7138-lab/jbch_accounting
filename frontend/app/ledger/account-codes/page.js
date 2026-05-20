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

  async function loadRows(keyword = query) {
    try {
      const data = await apiFetch(`/ledger/account-codes${keyword ? `?query=${encodeURIComponent(keyword)}` : ''}`);
      setRows(data);
    } catch (error) {
      setMessage(`조회 실패: ${error.message}`);
    }
  }

  useEffect(() => {
    loadRows('');
  }, []);

  const exportHref = useMemo(() => `${API_BASE}/ledger/account-codes.xlsx${query ? `?query=${encodeURIComponent(query)}` : ''}`, [query]);

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
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
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
    if (!file) return;
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
      setMessage(`엑셀 업로드 완료, 생성 ${result.created}건, 수정 ${result.updated}건`);
      loadRows();
    } catch (error) {
      setMessage(`엑셀 업로드 실패: ${error.message}`);
    }
  }

  return (
    <div className="grid">
      <LedgerTabs />
      <div className="card page-hero">
        <div>
          <h2>계정코드</h2>
          <p className="muted">등록, 수정, 조회와 엑셀 업로드 등록을 모두 여기서 처리해.</p>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      <div className="grid grid--2">
        <form className="card form-grid" onSubmit={handleSubmit}>
          <h2>{editingId ? '계정코드 수정' : '계정코드 등록'}</h2>
          <label>
            회계코드
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </label>
          <label>
            계정명
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            대분류관리항목
            <input value={form.major_category} onChange={(e) => setForm({ ...form, major_category: e.target.value })} />
          </label>
          <label>
            중분류관리항목
            <input value={form.middle_category} onChange={(e) => setForm({ ...form, middle_category: e.target.value })} />
          </label>
          <label>
            세부관리항목(보고용)
            <input value={form.report_category} onChange={(e) => setForm({ ...form, report_category: e.target.value })} />
          </label>
          <label>
            계정유형
            <input value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} />
          </label>
          <label>
            재무분류
            <input value={form.finance_category} onChange={(e) => setForm({ ...form, finance_category: e.target.value })} />
          </label>
          <label>
            차변계정
            <input value={form.debit_account} onChange={(e) => setForm({ ...form, debit_account: e.target.value })} />
          </label>
          <label>
            대변계정
            <input value={form.credit_account} onChange={(e) => setForm({ ...form, credit_account: e.target.value })} />
          </label>
          <label>
            기본방향
            <input value={form.normal_side} onChange={(e) => setForm({ ...form, normal_side: e.target.value })} />
          </label>
          <label className="checkbox-field form-grid__wide">
            사용 여부
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </label>
          <div className="actions form-grid__wide">
            <button type="submit">{editingId ? '수정 저장' : '등록'}</button>
            <button type="button" className="secondary" onClick={resetForm}>입력 초기화</button>
          </div>
          {message ? <div className="helper-card form-grid__wide">{message}</div> : null}
        </form>

        <div className="grid">
          <div className="card form-grid">
            <label className="form-grid__wide">
              계정코드 엑셀 업로드
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="actions form-grid__wide">
              <button type="button" onClick={handleUpload}>엑셀 업로드 등록</button>
            </div>
          </div>
          <div className="card grid">
            <div className="inline-row">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="코드, 계정명, 분류 검색" />
              <button type="button" className="secondary" onClick={() => loadRows(query)}>조회</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>계정명</th>
                    <th>보고용</th>
                    <th>수정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.report_category}</td>
                      <td><button type="button" className="secondary" onClick={() => startEdit(row)}>선택</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
