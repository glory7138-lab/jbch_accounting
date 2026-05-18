'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

const initialState = {
  voucher_date: new Date().toISOString().slice(0, 10),
  entry_type: 'income',
  description: '',
  amount: '',
  fund_id: '',
  account_id: '',
  note: '',
  counterparty: '',
};

export default function VoucherForm({ onCreated }) {
  const [form, setForm] = useState(initialState);
  const [accounts, setAccounts] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/accounts'), apiFetch('/accounts/funds')])
      .then(([accountsData, fundsData]) => {
        setAccounts(accountsData);
        setFunds(fundsData);
      })
      .catch(console.error);
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount || 0),
          fund_id: form.fund_id ? Number(form.fund_id) : null,
          account_id: form.account_id ? Number(form.account_id) : null,
          lines: [],
        }),
      });
      setForm(initialState);
      onCreated?.();
    } catch (error) {
      alert(`전표 저장 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>전표 입력</h2>
      <label>
        거래일자
        <input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
      </label>
      <label>
        유형
        <select value={form.entry_type} onChange={(e) => setForm({ ...form, entry_type: e.target.value })}>
          <option value="income">수입</option>
          <option value="expense">지출</option>
        </select>
      </label>
      <label>
        계정과목
        <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
          <option value="">선택 안 함</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
          ))}
        </select>
      </label>
      <label>
        회계/기금
        <select value={form.fund_id} onChange={(e) => setForm({ ...form, fund_id: e.target.value })}>
          <option value="">선택 안 함</option>
          {funds.map((fund) => (
            <option key={fund.id} value={fund.id}>{fund.name}</option>
          ))}
        </select>
      </label>
      <label className="form-grid__wide">
        적요
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="예: 주일 헌금, 교재 구입" required />
      </label>
      <label>
        금액
        <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
      </label>
      <label>
        거래처/상대방
        <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
      </label>
      <label className="form-grid__wide">
        비고
        <textarea rows="3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>
      <button type="submit" disabled={loading}>{loading ? '저장 중...' : '전표 저장'}</button>
    </form>
  );
}
