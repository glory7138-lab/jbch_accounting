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
  salvation_date: '',
  person_id: '',
};

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('-')) return dateStr;
  if (dateStr.length === 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  return dateStr;
}

function formatDateForApi(dateStr) {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '');
}

function getNextAvailableMemberNo(dept, currentRows) {
  if (!dept) return '';
  let suffix = '';
  if (dept === '어머니회') suffix = '*';
  else if (dept === '청년회') suffix = '+';
  else if (dept === '은장회') suffix = '-';

  const usedNumbers = new Set();
  currentRows.forEach(row => {
    if (row.department_name === dept) {
      const m = (row.member_no || '').trim();
      const match = m.match(/\d+/);
      if (match) {
        usedNumbers.add(parseInt(match[0], 10));
      }
    }
  });

  let nextNum = 1;
  while (usedNumbers.has(nextNum)) {
    nextNum++;
  }
  return `${nextNum}${suffix}`;
}

export default function EnvelopesPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 회별 필터링 상태
  const [selectedDept, setSelectedDept] = useState('전체');

  // 페이징 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (selectedDept === '전체') return true;
      return r.department_name === selectedDept;
    });
  }, [rows, selectedDept]);

  const paginatedRows = useMemo(() => {
    if (pageSize === '전체') return filteredRows;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === '전체') return 1;
    return Math.ceil(filteredRows.length / pageSize) || 1;
  }, [filteredRows, pageSize]);

  // 필터 변경 시 1페이지로 복구
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDept, query, pageSize]);

  function handleDepartmentChange(dept) {
    const nextForm = { ...form, department_name: dept };
    if (!editingId) {
      // 신규 등록일 때만 부서 규칙에 따른 다음 미사용 번호 추천 세팅
      nextForm.member_no = getNextAvailableMemberNo(dept, rows);
    }
    setForm(nextForm);
  }



  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedYear = sessionStorage.getItem('envelopes_year');
      const savedQuery = sessionStorage.getItem('envelopes_query');
      if (savedYear) setYear(Number(savedYear));
      if (savedQuery !== null) setQuery(savedQuery);
    }
    setIsInitialized(true);
  }, []);

  async function loadRows(keyword = query, targetYear = year) {
    setLoading(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('envelopes_query', keyword);
    }
    try {
      const url = `/offerings/envelopes?year=${targetYear}${keyword ? `&query=${encodeURIComponent(keyword)}` : ''}`;
      const next = await apiFetch(url);
      setRows(next);
    } catch (error) {
      setMessage(`조회 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isInitialized) return;

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('envelopes_year', String(year));
    }
    loadRows(query, year);
  }, [year, isInitialized]);

  const exportHref = useMemo(() => {
    return `${API_BASE}/offerings/envelopes.xlsx?year=${year}${query ? `&query=${encodeURIComponent(query)}` : ''}`;
  }, [query, year]);



  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      member_no: row.member_no || '',
      name: row.name || '',
      department_name: row.department_name || '',
      district_name: row.district_name || '',
      salvation_date: formatDateForInput(row.salvation_date) || '',
      person_id: row.person_id || '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // 중복 봉투 번호 검사
    const isDuplicate = rows.some(r => r.member_no === form.member_no && r.id !== editingId);
    if (isDuplicate) {
      alert(`이미 ${year}년에 등록된 봉투번호(${form.member_no})입니다. 다른 번호를 입력하거나 기존 정보를 확인해 주세요.`);
      return;
    }

    try {
      const payload = { 
        ...form, 
        year,
        salvation_date: formatDateForApi(form.salvation_date)
      };
      if (editingId) {
        await apiFetch(`/offerings/envelopes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('수정 완료');
      } else {
        await apiFetch('/offerings/envelopes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage('등록 완료');
      }
      resetForm();
      loadRows();
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    const currentMemberName = form.name || '해당 성도';
    if (!confirm(`${year}년의 '${currentMemberName}' 성도 정보를 정말 삭제하시겠습니까?\n삭제 후에도 기존에 헌금했던 내역과 '${currentMemberName}' 성도 이름은 그대로 보존되어 안전하게 표시됩니다.`)) {
      return;
    }

    try {
      await apiFetch(`/offerings/envelopes/${editingId}`, {
        method: 'DELETE',
      });
      setMessage('삭제 완료');
      resetForm();
      loadRows();
    } catch (error) {
      setMessage(`삭제 실패: ${error.message}`);
    }
  }

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />
      
      <div className="card page-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div>
            <h2>헌금봉투 번호 조회, 수정, 등록</h2>
            <p className="muted">봉투번호 기준정보를 조회하고 수정하거나 새로 등록할 수 있어.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 'bold' }}>기준 연도:</span>
            <select 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px' }}
            >
              <option value={2025}>2025년</option>
              <option value={2026}>2026년</option>
              <option value={2027}>2027년</option>
              <option value={2028}>2028년</option>
            </select>
          </div>
        </div>
        <ExportButtons items={[{ label: `${year}년 엑셀 다운로드`, href: exportHref }]} />
      </div>

      <div className="grid grid--2">
        <form className="card form-grid" onSubmit={handleSubmit} style={{ width: '100%', minWidth: 0, alignSelf: 'start' }}>
          <h2>{editingId ? `${year}년 봉투번호 수정` : `${year}년 봉투번호 등록`}</h2>
          <label>
            봉투번호
            <input 
              value={form.member_no} 
              onChange={(e) => {
                const val = e.target.value;
                let dept = form.department_name;
                const trimmed = val.trim();
                
                if (trimmed === '') {
                  dept = '';
                } else if (trimmed.endsWith('-')) {
                  dept = '은장회';
                } else if (trimmed.endsWith('*')) {
                  dept = '어머니회';
                } else if (trimmed.endsWith('+')) {
                  dept = '청년회';
                } else if (/^\d+$/.test(trimmed)) {
                  dept = '봉사회';
                }
                
                setForm({ ...form, member_no: val, department_name: dept });
              }} 
            />
          </label>
          <label>
            이름
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>



          <label>
            회별
            <select 
              value={form.department_name} 
              onChange={(e) => handleDepartmentChange(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}
            >
              <option value="">선택 안함</option>
              <option value="은장회">은장회 (-)</option>
              <option value="봉사회">봉사회</option>
              <option value="어머니회">어머니회 (*)</option>
              <option value="청년회">청년회 (+)</option>
            </select>
          </label>
          <label>
            구역
            <input value={form.district_name} onChange={(e) => setForm({ ...form, district_name: e.target.value })} />
          </label>
          <label>
            구원일
            <input 
              type="text" 
              placeholder="예: 20250515"
              value={form.salvation_date} 
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9-]/g, '');
                setForm({ ...form, salvation_date: val });
              }}
              onBlur={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length === 8) {
                  const formatted = `${val.substring(0, 4)}-${val.substring(4, 6)}-${val.substring(6, 8)}`;
                  setForm({ ...form, salvation_date: formatted });
                }
              }}
              onFocus={(e) => {
                const val = e.target.value.replace(/-/g, '');
                if (val.length === 8) {
                  setForm({ ...form, salvation_date: val });
                }
              }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}
            />
          </label>
          {form.person_id && (
            <div className="form-grid__wide" style={{ fontSize: '12px', color: '#17a2b8' }}>
              * 고유 식별 키(Person ID): {form.person_id}
            </div>
          )}
          <div className="actions form-grid__wide" style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="submit" style={{ flex: 1, padding: '12px' }}>{editingId ? '수정 저장' : '새로 등록'}</button>
            {editingId && (
              <button 
                type="button" 
                onClick={handleDelete} 
                style={{ flex: 1, padding: '12px', background: '#dc3545', color: '#ffffff', border: 'none', cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                onMouseOver={(e) => e.target.style.background = '#bd2130'}
                onMouseOut={(e) => e.target.style.background = '#dc3545'}
              >
                성도 삭제
              </button>
            )}
            <button type="button" className="secondary" onClick={resetForm} style={{ flex: editingId ? 'none' : 1, padding: '12px', minWidth: editingId ? '100px' : 'auto' }}>입력 초기화</button>
          </div>
          {message ? <div className="helper-card form-grid__wide">{message}</div> : null}
        </form>

        <div className="card grid" style={{ width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder={`${year}년 봉투번호, 이름, 회별, 구역 검색`} 
              style={{ flex: 1 }}
            />
            <button 
              type="button" 
              className="secondary" 
              onClick={() => loadRows(query)}
              style={{ whiteSpace: 'nowrap', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              조회
            </button>
          </div>

          {/* 회별 구분 조회 탭 필터 */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0 8px 0' }}>
            {['전체', '은장회', '봉사회', '어머니회', '청년회'].map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDept(dept)}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  borderRadius: '999px',
                  border: selectedDept === dept ? '1px solid #bfd5ff' : '1px solid #dbe3f0',
                  background: selectedDept === dept ? '#eef4ff' : '#ffffff',
                  color: selectedDept === dept ? '#1d4ed8' : '#637083',
                  fontWeight: selectedDept === dept ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* 건수 표시 및 보기 개수 선택기 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 12px 0', borderBottom: '1px solid #f1f3f5', paddingBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#637083' }}>총 {filteredRows.length}개 검색됨</span>
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
                <option value={40}>40개씩</option>
                <option value={50}>50개씩</option>
                <option value="전체">전체 보기</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>봉투번호</th>
                  <th>ID</th>
                  <th>이름</th>
                  <th>회별</th>
                  <th>구역</th>
                  <th>구원일</th>
                  <th>수정</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7">조회 중...</td></tr>
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: '#868e96', padding: '24px' }}>
                      {selectedDept === '전체'
                        ? `${year}년에 등록된 헌금봉투 번호 정보가 없습니다.`
                        : `${year}년 ${selectedDept}에 등록된 헌금봉투 번호 정보가 없습니다.`}
                    </td>
                  </tr>
                ) : paginatedRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.member_no}</td>
                    <td><span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#17a2b8' }}>{row.person_id}</span></td>
                    <td>{row.name}</td>
                    <td>{row.department_name}</td>
                    <td>{row.district_name}</td>
                    <td>{row.salvation_date ? formatDateForInput(row.salvation_date) : '-'}</td>
                    <td><button type="button" className="secondary" onClick={() => startEdit(row)}>선택</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 컨트롤 */}
          {pageSize !== '전체' && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', fontSize: '13px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                이전
              </button>
              <span style={{ fontSize: '13px', color: '#637083', minWidth: '70px', textAlign: 'center' }}>
                {currentPage} / {totalPages}
              </span>
              <button 
                type="button" 
                className="secondary" 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 12px', fontSize: '13px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
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
