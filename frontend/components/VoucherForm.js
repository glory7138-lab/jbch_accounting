'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

const baseState = {
  voucher_date: new Date().toISOString().slice(0, 10),
  entry_type: 'income',
  description: '',
  amount: '',
  fund_name: '',
  account_id: '',
  member_id: '',
  member_key: '',
  note: '',
  counterparty: '',
};

export default function VoucherForm({ onCreated }) {
  const [form, setForm] = useState(baseState);
  const [accounts, setAccounts] = useState([]);
  const [funds, setFunds] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [memberLookup, setMemberLookup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/accounts'), apiFetch('/accounts/funds')])
      .then(([accountsData, fundsData]) => {
        setAccounts(accountsData);
        setFunds(fundsData);
      })
      .catch(console.error);
  }, []);

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
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [accounts, accountFilter]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => String(account.id) === String(form.account_id)),
    [accounts, form.account_id],
  );

  async function handleMemberLookup() {
    const key = form.member_key.trim();
    if (!key) {
      setMemberLookup(null);
      setForm((current) => ({ ...current, member_id: '', counterparty: '' }));
      return;
    }

    setLookupLoading(true);
    try {
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(key)}`);
      setMemberLookup(result);
      if (result.found && result.member) {
        setForm((current) => ({
          ...current,
          member_id: String(result.member.id),
          counterparty: current.counterparty || result.member.name,
        }));
      } else {
        setForm((current) => ({ ...current, member_id: '' }));
      }
    } catch (error) {
      alert(`헌금자 조회 실패: ${error.message}`);
    } finally {
      setLookupLoading(false);
    }
  }

  function resetForm() {
    setForm(baseState);
    setMemberLookup(null);
    setAccountFilter('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          voucher_date: form.voucher_date,
          entry_type: form.entry_type,
          description: form.description,
          amount: Number(form.amount || 0),
          fund_name: form.fund_name.trim() || null,
          account_id: form.account_id ? Number(form.account_id) : null,
          member_id: form.member_id ? Number(form.member_id) : null,
          counterparty: form.counterparty.trim() || null,
          note: form.note.trim() || null,
          lines: [],
        }),
      });
      resetForm();
      onCreated?.();
    } catch (error) {
      alert(`전표 저장 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card voucher-form" onSubmit={handleSubmit}>
      <div className="voucher-form__header">
        <div>
          <h2>전표 입력</h2>
          <p className="muted">헌금 봉투 번호로 헌금자를 불러오고, 계정은 세부항목까지 확인하면서 기록해.</p>
        </div>
        <div className="voucher-form__badge">유니크 키: 헌금 봉투 번호</div>
      </div>

      <div className="form-grid">
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
          헌금자 식별키
          <div className="inline-row">
            <input
              value={form.member_key}
              onChange={(e) => setForm({ ...form, member_key: e.target.value })}
              placeholder="예: 헌금 봉투 번호 23"
            />
            <button type="button" className="secondary" onClick={handleMemberLookup} disabled={lookupLoading}>
              {lookupLoading ? '조회 중...' : '조회'}
            </button>
          </div>
        </label>
        <label>
          헌금 항목/회계명
          <>
            <input
              list="fund-name-options"
              value={form.fund_name}
              onChange={(e) => setForm({ ...form, fund_name: e.target.value })}
              placeholder="예: 주일헌금, 선교헌금, 교회학교후원회비"
            />
            <datalist id="fund-name-options">
              {funds.map((fund) => (
                <option key={fund.id} value={fund.name} />
              ))}
            </datalist>
          </>
        </label>

        <label className="form-grid__wide">
          계정 검색
          <input
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            placeholder="코드, 계정명, 세부항목, 재정구분으로 검색"
          />
        </label>
        <label className="form-grid__wide">
          계정과목 선택
          <select size="8" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            {filteredAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {[account.code, account.name, account.report_category, account.account_type, account.finance_category]
                  .filter(Boolean)
                  .join(' · ')}
              </option>
            ))}
          </select>
        </label>

        {selectedAccount ? (
          <div className="form-grid__wide helper-card">
            <strong>선택한 계정</strong>
            <div>{selectedAccount.code} · {selectedAccount.name}</div>
            <div className="muted">
              {[selectedAccount.report_category, selectedAccount.account_type, selectedAccount.finance_category]
                .filter(Boolean)
                .join(' · ') || '세부 정보 없음'}
            </div>
          </div>
        ) : null}

        {memberLookup ? (
          <div className="form-grid__wide helper-card">
            <strong>헌금자 조회 결과</strong>
            {memberLookup.found && memberLookup.member ? (
              <div className="lookup-grid">
                <div><span className="muted">번호</span><br />{memberLookup.member.member_no || '-'}</div>
                <div><span className="muted">이름</span><br />{memberLookup.member.name}</div>
                <div><span className="muted">회/부서</span><br />{memberLookup.member.department_name || '-'}</div>
                <div><span className="muted">구분</span><br />{memberLookup.member.gender_or_section || '-'}</div>
              </div>
            ) : (
              <div className="muted">{memberLookup.message}</div>
            )}
          </div>
        ) : null}

        <label className="form-grid__wide">
          적요
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={form.entry_type === 'income' ? '예: 주일헌금 입금, 선교헌금 접수' : '예: 교재 구입, 부서 지원금 지출'}
            required
          />
        </label>
        <label>
          금액
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </label>
        <label>
          거래처/상대방
          <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="헌금자 이름 또는 거래처" />
        </label>
        <label className="form-grid__wide">
          비고
          <textarea rows="3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="추가 메모가 있으면 적어줘" />
        </label>
      </div>

      <div className="voucher-form__footer actions">
        <button type="submit" disabled={loading}>{loading ? '저장 중...' : '전표 저장'}</button>
        <button type="button" className="secondary" onClick={resetForm}>입력 초기화</button>
      </div>
    </form>
  );
}
