'use client';

import VoucherForm from '../../../components/VoucherForm';

export default function ManualVoucherPage() {
  return (
    <div className="grid">
      <div className="page-hero card">
        <div>
          <h1>일반 전표 입력</h1>
          <p className="muted">주간 헌금 입력과 분리해서, 일반 수입/지출 전표는 여기서 따로 입력하면 돼.</p>
        </div>
      </div>

      <VoucherForm />
    </div>
  );
}
