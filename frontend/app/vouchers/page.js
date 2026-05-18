'use client';

import { useCallback, useEffect, useState } from 'react';
import VoucherForm from '../../components/VoucherForm';
import { apiFetch } from '../../lib/api';

function money(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState([]);
  const [error, setError] = useState('');

  const loadVouchers = useCallback(() => {
    apiFetch('/vouchers')
      .then(setVouchers)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  return (
    <div className="grid">
      <div className="page-hero card">
        <div>
          <h1>전표 관리</h1>
          <p className="muted">헌금 봉투 번호로 사람을 찾고, 세부 계정 설명을 보면서 수입/지출을 기록하도록 화면을 다듬었어.</p>
        </div>
        <div className="hero-tips">
          <div><strong>추천 흐름</strong></div>
          <div>1. 헌금자 번호 조회</div>
          <div>2. 헌금 항목 직접 입력</div>
          <div>3. 세부 계정 확인 후 저장</div>
        </div>
      </div>

      <VoucherForm onCreated={loadVouchers} />

      <div className="card">
        <div className="section-header">
          <h2>최근 전표 목록</h2>
          <span className="muted">최대 200건</span>
        </div>
        {error ? <p>불러오기 실패: {error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>전표번호</th>
                <th>일자</th>
                <th>유형</th>
                <th>헌금자/상대</th>
                <th>계정과목</th>
                <th>회계/기금</th>
                <th>적요</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((voucher) => (
                <tr key={voucher.id}>
                  <td>{voucher.voucher_no}</td>
                  <td>{voucher.voucher_date}</td>
                  <td>{voucher.entry_type === 'income' ? '수입' : '지출'}</td>
                  <td>{voucher.member?.name || voucher.counterparty || '-'}</td>
                  <td>
                    <div>{voucher.account?.name || '-'}</div>
                    <div className="muted table-subtext">
                      {[voucher.account?.code, voucher.account?.report_category, voucher.account?.finance_category].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td>{voucher.fund?.name || voucher.fund_name || '-'}</td>
                  <td>{voucher.description}</td>
                  <td>{money(voucher.amount)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
