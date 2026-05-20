'use client';

import { useEffect, useMemo, useState } from 'react';
import ExportButtons from '../../../components/ExportButtons';
import SectionTabs from '../../../components/SectionTabs';
import { apiFetch, API_BASE } from '../../../lib/api';
import { offeringMenuItems } from '../../../lib/appMenus';

const emptyForm = {
  member_no: '',
  name: '',
  department_name: '',
  district_name: '',
  gender_or_section: '',
  age_or_class: '',
};

export default function EnvelopesPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadRows(keyword = query) {
    setLoading(true);
    try {
      const next = await apiFetch(`/offerings/envelopes${keyword ? `?query=${encodeURIComponent(keyword)}` : ''}`);
      setRows(next);
    } catch (error) {
      setMessage(`조회 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows('');
  }, []);

  const exportHref = useMemo(() => `${API_BASE}/offerings/envelopes.xlsx${query ? `?query=${encodeURIComponent(query)}` : ''}`, [query]);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      member_no: row.member_no || '',
      name: row.name || '',
      department_name: row.department_name || '',
      district_name: row.district_name || '',
      gender_or_section: row.gender_or_section || '',
      age_or_class: row.age_or_class || '',
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
        await apiFetch(`/offerings/envelopes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        setMessage('수정 완료');
      } else {
        await apiFetch('/offerings/envelopes', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setMessage('등록 완료');
      }
      resetForm();
      loadRows();
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`);
    }
  }

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />
      <div className="card page-hero">
        <div>
          <h2>헌금봉투 번호 조회, 수정, 등록</h2>
          <p className="muted">봉투번호 기준정보를 조회하고 수정하거나 새로 등록할 수 있어.</p>
        </div>
        <ExportButtons items={[{ label: '엑셀 다운로드', href: exportHref }]} />
      </div>

      <div className="grid grid--2">
        <form className="card form-grid" onSubmit={handleSubmit}>
          <h2>{editingId ? '봉투번호 수정' : '봉투번호 등록'}</h2>
          <label>
            봉투번호
            <input value={form.member_no} onChange={(e) => setForm({ ...form, member_no: e.target.value })} />
          </label>
          <label>
            이름
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            회별
            <input value={form.department_name} onChange={(e) => setForm({ ...form, department_name: e.target.value })} />
          </label>
          <label>
            구역
            <input value={form.district_name} onChange={(e) => setForm({ ...form, district_name: e.target.value })} />
          </label>
          <label>
            구분
            <input value={form.gender_or_section} onChange={(e) => setForm({ ...form, gender_or_section: e.target.value })} />
          </label>
          <label>
            반/연령
            <input value={form.age_or_class} onChange={(e) => setForm({ ...form, age_or_class: e.target.value })} />
          </label>
          <div className="actions form-grid__wide">
            <button type="submit">{editingId ? '수정 저장' : '새로 등록'}</button>
            <button type="button" className="secondary" onClick={resetForm}>입력 초기화</button>
          </div>
          {message ? <div className="helper-card form-grid__wide">{message}</div> : null}
        </form>

        <div className="card grid">
          <div className="inline-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="봉투번호, 이름, 회별, 구역 검색" />
            <button type="button" className="secondary" onClick={() => loadRows(query)}>조회</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>봉투번호</th>
                  <th>이름</th>
                  <th>회별</th>
                  <th>구역</th>
                  <th>수정</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5">조회 중...</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.member_no}</td>
                    <td>{row.name}</td>
                    <td>{row.department_name}</td>
                    <td>{row.district_name}</td>
                    <td><button type="button" className="secondary" onClick={() => startEdit(row)}>선택</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
