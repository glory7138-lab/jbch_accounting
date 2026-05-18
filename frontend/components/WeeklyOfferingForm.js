'use client';

import { useEffect, useMemo, useState } from 'react';
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

const initialOfferings = Object.fromEntries(OFFERING_FIELDS.map((field) => [field.code, '']));
const initialState = {
  voucher_date: new Date().toISOString().slice(0, 10),
  envelope_no: '',
  member_id: '',
  member_key: '',
  member_name: '',
  department_name: '',
  district_name: '',
  is_transfer: false,
  note: '',
  offerings: initialOfferings,
};

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

export default function WeeklyOfferingForm({ onCreated }) {
  const [form, setForm] = useState(initialState);
  const [memberLookup, setMemberLookup] = useState(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  const month = useMemo(() => Number(form.voucher_date.slice(5, 7)), [form.voucher_date]);
  const totalAmount = useMemo(
    () => OFFERING_FIELDS.reduce((sum, field) => sum + Number(form.offerings[field.code] || 0), 0),
    [form.offerings],
  );
  const cashTotal = form.is_transfer ? 0 : totalAmount;

  function applySelectedMember(member) {
    setMemberLookup({ found: true, member });
    setForm((current) => ({
      ...current,
      member_id: String(member.id),
      member_key: member.member_no || current.member_key,
      envelope_no: current.envelope_no || member.member_no || '',
      member_name: member.name || '',
      department_name: member.department_name || '',
    }));
    setMemberSearchResults([]);
    setMemberSearchQuery('');
  }

  async function handleLookup() {
    const key = (form.member_key || form.envelope_no).trim();
    if (!key) return;
    setLookupLoading(true);
    try {
      const result = await apiFetch(`/accounts/member-lookup?memberKey=${encodeURIComponent(key)}`);
      setMemberLookup(result);
      if (result.found && result.member) {
        applySelectedMember(result.member);
      }
    } catch (error) {
      alert(`번호 조회 실패: ${error.message}`);
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSearch() {
    const query = memberSearchQuery.trim();
    if (!query) return;
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

  function setOffering(code, value) {
    setForm((current) => ({
      ...current,
      offerings: {
        ...current.offerings,
        [code]: value,
      },
    }));
  }

  function resetAmountsOnly() {
    setForm((current) => ({
      ...current,
      note: '',
      is_transfer: false,
      offerings: { ...initialOfferings },
    }));
    setResultMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        voucher_date: form.voucher_date,
        month,
        envelope_no: form.envelope_no.trim() || null,
        member_id: form.member_id ? Number(form.member_id) : null,
        member_name: form.member_name.trim() || null,
        department_name: form.department_name.trim() || null,
        district_name: form.district_name.trim() || null,
        is_transfer: form.is_transfer,
        note: form.note.trim() || null,
        offerings: Object.fromEntries(
          Object.entries(form.offerings)
            .filter(([, value]) => Number(value || 0) > 0)
            .map(([code, value]) => [code, Number(value)]),
        ),
      };

      const result = await apiFetch('/vouchers/weekly-offering', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResultMessage(`등록 완료, ${result.created_count}건 생성, 총 ${money(result.total_amount)}원`);
      resetAmountsOnly();
      onCreated?.();
    } catch (error) {
      alert(`주간 헌금 등록 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card weekly-offering-form" onSubmit={handleSubmit}>
      <div className="section-header">
        <div>
          <h2>주간 헌금 빠른 등록</h2>
          <p className="muted">주일 오후에 봉투를 모아 한 사람씩 빠르게 입력하는 1차 화면이야.</p>
        </div>
        <div className="voucher-form__badge">1차 정리용</div>
      </div>

      <div className="weekly-meta-grid">
        <label>
          날짜
          <input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
        </label>
        <label>
          월
          <input value={month} readOnly />
        </label>
        <label>
          봉투번호
          <div className="inline-row">
            <input value={form.envelope_no} onChange={(e) => setForm({ ...form, envelope_no: e.target.value, member_key: e.target.value })} />
            <button type="button" className="secondary" onClick={handleLookup} disabled={lookupLoading}>{lookupLoading ? '조회 중...' : '번호 조회'}</button>
          </div>
        </label>
        <label>
          이름 일부 검색
          <div className="inline-row">
            <input value={memberSearchQuery} onChange={(e) => setMemberSearchQuery(e.target.value)} placeholder="예: 형석" />
            <button type="button" className="secondary" onClick={handleSearch} disabled={searchLoading}>{searchLoading ? '검색 중...' : '이름 검색'}</button>
          </div>
        </label>
        <label>
          이름
          <input value={form.member_name} onChange={(e) => setForm({ ...form, member_name: e.target.value })} />
        </label>
        <label>
          회별
          <input value={form.department_name} onChange={(e) => setForm({ ...form, department_name: e.target.value })} />
        </label>
        <label>
          구역
          <input value={form.district_name} onChange={(e) => setForm({ ...form, district_name: e.target.value })} />
        </label>
        <label className="checkbox-field">
          <span>이체헌금</span>
          <input type="checkbox" checked={form.is_transfer} onChange={(e) => setForm({ ...form, is_transfer: e.target.checked })} />
        </label>
      </div>

      {memberSearchResults.length ? (
        <div className="helper-card">
          <strong>검색된 헌금자 목록</strong>
          <div className="search-result-list">
            {memberSearchResults.map((member) => (
              <button key={member.id} type="button" className="search-result-item" onClick={() => applySelectedMember(member)}>
                <span>{member.name}</span>
                <span className="muted">번호 {member.member_no || '-'} · {member.department_name || '소속 없음'}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="weekly-entry-table-wrap">
        <table className="weekly-entry-table">
          <thead>
            <tr>
              {OFFERING_FIELDS.map((field) => (
                <th key={field.code}>{field.label}<br /><span className="muted">({field.code})</span></th>
              ))}
              <th>비고</th>
              <th>현금 합계</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {OFFERING_FIELDS.map((field) => (
                <td key={field.code}>
                  <input
                    type="number"
                    min="0"
                    value={form.offerings[field.code]}
                    onChange={(e) => setOffering(field.code, e.target.value)}
                    placeholder="0"
                  />
                </td>
              ))}
              <td>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="메모" />
              </td>
              <td>
                <strong>{money(cashTotal)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="helper-card weekly-summary-card">
        <div><strong>총 헌금액</strong><br />{money(totalAmount)}원</div>
        <div><strong>현금 합계</strong><br />{money(cashTotal)}원</div>
        <div><strong>이체 여부</strong><br />{form.is_transfer ? '이체헌금' : '현금봉투'}</div>
      </div>

      <div className="actions">
        <button type="submit" disabled={saving}>{saving ? '등록 중...' : '주간 헌금 등록'}</button>
        <button type="button" className="secondary" onClick={resetAmountsOnly}>금액만 초기화</button>
      </div>

      {resultMessage ? <div className="helper-card">{resultMessage}</div> : null}
    </form>
  );
}
