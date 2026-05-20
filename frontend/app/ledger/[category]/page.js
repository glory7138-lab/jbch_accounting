'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import LedgerTabs from '../../../components/LedgerTabs';
import { apiFetch, API_BASE } from '../../../lib/api';
import { ledgerMenuItems } from '../../../lib/appMenus';

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

export default function LedgerCategoryPage({ params }) {
  const today = new Date();
  const slug = params?.category;
  const category = ledgerMenuItems.find((item) => item.slug === slug && item.slug !== 'account-codes');
  const [year, setYear] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [accounts, setAccounts] = useState([]);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    voucher_date: today.toISOString().slice(0, 10),
    entry_type: 'income',
    description: '',
    amount: '',
    account_id: '',
    counterparty: '',
    note: '',
  });

  useEffect(() => {
    apiFetch('/accounts').then(setAccounts).catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    if (!category) return;
    const query = new URLSearchParams({ category: category.name, year });
    if (month) query.set('month', month);
    apiFetch(`/ledger/entries?${query.toString()}`)
      .then((result) => setRows(result.rows || []))
      .catch((err) => setMessage(err.message));
  }, [category, year, month]);

  const exportHref = useMemo(() => {
    if (!category) return '#';
    const query = new URLSearchParams({ category: category.name, year });
    if (month) query.set('month', month);
    return `${API_BASE}/ledger/entries.xlsx?${query.toString()}`;
  }, [category, year, month]);

  if (!category) {
    return <div className="card">알 수 없는 장부 구분입니다.</div>;
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      voucher_date: row.voucher_date,
      entry_type: row.entry_type,
      description: row.description || '',
      amount: String(row.amount || ''),
      account_id: row.account_id ? String(row.account_id) : '',
      counterparty: row.counterparty || '',
      note: row.note || '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      voucher_date: today.toISOString().slice(0, 10),
      entry_type: 'income',
      description: '',
      amount: '',
      account_id: '',
      counterparty: '',
      note: '',
    });
  }

  async function refreshRows() {
    const query = new URLSearchParams({ category: category.name, year });
    if (month) query.set('month', month);
    const result = await apiFetch(`/ledger/entries?${query.toString()}`);
    setRows(result.rows || []);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      voucher_date: form.voucher_date,
      entry_type: form.entry_type,
      description: form.description,
      amount: Number(form.amount || 0),
      category_name: category.name,
      account_id: form.account_id ? Number(form.account_id) : null,
      counterparty: form.counterparty || null,
      note: form.note || null,
    };
    try {
      if (editingId) {
        await apiFetch(`/ledger/entries/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('수정 완료');
      } else {
        await apiFetch('/ledger/entries', { method: 'POST', body: JSON.stringify(payload) });
        setMessage('등록 완료');
      }
      resetForm();
      refreshRows();
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`);
    }
  }

  return (
    <div className="grid">
      <LedgerTabs />
      <div className="card page-hero">
        <div>
          <h2>{category.label}</h2>
          <p className="muted">년도, 월 기준으로 조회하고 바로 등록/수정할 수 있게 구성했어.</p>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      <div className="card form-grid">
        <label>
          년도
          <input value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label>
          월
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">전체</option>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>{index + 1}월</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid--2">
        <form className="card form-grid" onSubmit={handleSubmit}>
          <h2>{editingId ? `${category.label} 수정` : `${category.label} 등록`}</h2>
          <label>
            일자
            <input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
          </label>
          <label>
            유형
            <select value={form.entry_type} onChange={(e) => setForm({ ...form, entry_type: e.target.value })}>
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
          </label>
          <label className="form-grid__wide">
            적요
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </label>
          <label>
            금액
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </label>
          <label>
            계정코드
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">선택</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
              ))}
            </select>
          </label>
          <label>
            거래처
            <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          </label>
          <label>
            비고
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div className="actions form-grid__wide">
            <button type="submit">{editingId ? '수정 저장' : '등록'}</button>
            <button type="button" className="secondary" onClick={resetForm}>입력 초기화</button>
          </div>
          {message ? <div className="helper-card form-grid__wide">{message}</div> : null}
        </form>

        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>일자</th>
                <th>전표번호</th>
                <th>계정</th>
                <th>적요</th>
                <th>금액</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.voucher_date}</td>
                  <td>{row.voucher_no}</td>
                  <td>{row.account_code ? `${row.account_code} · ${row.account_name || ''}` : '-'}</td>
                  <td>{row.description}</td>
                  <td>{money(row.amount)}원</td>
                  <td><button type="button" className="secondary" onClick={() => startEdit(row)}>수정</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
