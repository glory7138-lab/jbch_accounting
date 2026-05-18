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
      <div>
        <h1>전표 관리</h1>
        <p className="muted">수입/지출 내역 입력, 조회, 수정 기반의 핵심 화면이야.</p>
      </div>

      <VoucherForm onCreated={loadVouchers} />

      <div className="card">
        <h2>전표 목록</h2>
        {error ? <p>불러오기 실패: {error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>전표번호</th>
              <th>일자</th>
              <th>유형</th>
              <th>계정과목</th>
              <th>기금</th>
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
                <td>{voucher.account?.name || '-'}</td>
                <td>{voucher.fund?.name || '-'}</td>
                <td>{voucher.description}</td>
                <td>{money(voucher.amount)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
