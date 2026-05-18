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

function groupKeyFor(account) {
  return account.middle_category || account.name || account.code;
}

function accountDisplayName(account) {
  return account.report_category || account.name || account.code;
}

function accountFullLabel(account) {
  return [account.code, account.name, account.report_category, account.account_type, account.finance_category]
    .filter(Boolean)
    .join(' · ');
}

function matchesKeyword(account, keyword) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
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
  return haystack.includes(normalized);
}

function matchesDepartment(account, department) {
  const dept = (department || '').trim();
  if (!dept) return true;
  const report = (account.report_category || '').trim();
  if (!report) return true;
  const haystack = [report, account.name, account.middle_category, account.major_category, account.finance_category]
    .filter(Boolean)
    .join(' ');
  return haystack.includes(dept);
}

export default function VoucherForm({ onCreated }) {
  const [form, setForm] = useState(baseState);
  const [accounts, setAccounts] = useState([]);
  const [funds, setFunds] = useState([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [memberLookup, setMemberLookup] = useState(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [autoDescription, setAutoDescription] = useState('');

  useEffect(() => {
    Promise.all([apiFetch('/accounts'), apiFetch('/accounts/funds')])
      .then(([accountsData, fundsData]) => {
        setAccounts(accountsData);
        setFunds(fundsData);
      })
      .catch(console.error);
  }, []);

  const memberDepartment = memberLookup?.member?.department_name || '';

  const groupedAccounts = useMemo(() => {
    const groups = new Map();
    accounts.forEach((account) => {
      if (!matchesKeyword(account, accountFilter)) return;
      if (!matchesDepartment(account, memberDepartment)) return;

      const key = groupKeyFor(account);
      const current = groups.get(key) || { key, label: key, representative: null, accounts: [] };
      current.accounts.push(account);
      if (!current.representative) {
        current.representative = account;
      }
      if (!account.report_category || String(account.code).endsWith('00')) {
        current.representative = account;
      }
      groups.set(key, current);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        accounts: group.accounts.sort((a, b) => String(a.code).localeCompare(String(b.code))),
      }))
      .sort((a, b) => String(a.representative?.code || a.label).localeCompare(String(b.representative?.code || b.label)));
  }, [accounts, accountFilter, memberDepartment]);

  useEffect(() => {
    if (!groupedAccounts.length) {
      setSelectedGroup('');
      return;
    }
    if (!groupedAccounts.some((group) => group.key === selectedGroup)) {
      setSelectedGroup(groupedAccounts[0].key);
    }
  }, [groupedAccounts, selectedGroup]);

  const activeGroup = useMemo(
    () => groupedAccounts.find((group) => group.key === selectedGroup) || null,
    [groupedAccounts, selectedGroup],
  );

  const selectableAccounts = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.accounts;
  }, [activeGroup]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => String(account.id) === String(form.account_id)),
    [accounts, form.account_id],
  );

  function applySelectedMember(member, foundBy = 'member_no', message = null) {
    setMemberLookup({ found: true, lookup_key: member.member_no || member.name, found_by: foundBy, member, message });
    setForm((current) => ({
      ...current,
      member_id: String(member.id),
      member_key: member.member_no || current.member_key,
      counterparty: current.counterparty || member.name,
    }));
    setMemberSearchResults([]);
    setMemberSearchQuery('');
  }

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

  async function handleMemberSearch() {
    const query = memberSearchQuery.trim();
    if (!query) {
      setMemberSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await apiFetch(`/accounts/member-search?query=${encodeURIComponent(query)}`);
      setMemberSearchResults(results);
    } catch (error) {
      alert(`헌금자 검색 실패: ${error.message}`);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleAccountChange(accountId) {
    const nextAccount = accounts.find((account) => String(account.id) === String(accountId));
    const nextDescription = nextAccount ? accountDisplayName(nextAccount) : '';

    setForm((current) => {
      const shouldReplaceDescription = !current.description || current.description === autoDescription;
      return {
        ...current,
        account_id: accountId,
        description: shouldReplaceDescription ? nextDescription : current.description,
      };
    });
    setAutoDescription(nextDescription);
  }

  function resetForm() {
    setForm(baseState);
    setMemberLookup(null);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setAccountFilter('');
    setAutoDescription('');
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
          <p className="muted">대표 계정을 먼저 고르고, 그 아래 세부 계정을 고르는 방식으로 바꿨어. 헌금자 회별과 맞는 계정이 우선 보이도록 필터돼.</p>
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
              {lookupLoading ? '조회 중...' : '번호 조회'}
            </button>
          </div>
        </label>
        <label>
          이름 일부로 사람 찾기
          <div className="inline-row">
            <input
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              placeholder="예: 영, 정, 청년"
            />
            <button type="button" className="secondary" onClick={handleMemberSearch} disabled={searchLoading}>
              {searchLoading ? '검색 중...' : '이름 검색'}
            </button>
          </div>
        </label>

        {memberSearchResults.length ? (
          <div className="form-grid__wide helper-card">
            <strong>검색된 헌금자 목록</strong>
            <div className="search-result-list">
              {memberSearchResults.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="search-result-item"
                  onClick={() => applySelectedMember(member, 'name_search')}
                >
                  <span>{member.name}</span>
                  <span className="muted">번호 {member.member_no || '-'} · {member.department_name || '소속 없음'}</span>
                </button>
              ))}
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
        <label>
          계정 검색
          <input
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            placeholder="대표계정, 세부항목, 재정구분 검색"
          />
        </label>

        <label>
          대표 계정
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
            {groupedAccounts.map((group) => (
              <option key={group.key} value={group.key}>
                {group.representative?.code || '-'} · {group.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          세부 계정
          <select value={form.account_id} onChange={(e) => handleAccountChange(e.target.value)}>
            <option value="">선택 안 함</option>
            {selectableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountFullLabel(account)}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid__wide helper-card">
          <strong>지금 보이는 세부 계정 기준</strong>
          <div className="muted">
            {memberDepartment
              ? `${memberDepartment}과(와) 일치하는 계정 + 구분 없는 계정을 함께 보여주는 중`
              : '헌금자를 선택하지 않아서 전체 계정을 보여주는 중'}
          </div>
        </div>

        {activeGroup ? (
          <div className="form-grid__wide helper-card">
            <strong>{activeGroup.label} 하위 계정</strong>
            <div className="account-pill-list">
              {activeGroup.accounts.map((account) => {
                const active = String(form.account_id) === String(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={`account-pill ${active ? 'active' : ''}`}
                    onClick={() => handleAccountChange(String(account.id))}
                  >
                    {accountFullLabel(account)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

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

        <label className="form-grid__wide">
          적요
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={form.entry_type === 'income' ? '계정 선택 시 기본 적요가 자동 입력돼' : '예: 교재 구입, 부서 지원금 지출'}
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
