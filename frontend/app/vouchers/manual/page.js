'use client';

import ExportButtons from '../../../components/ExportButtons';
import VoucherForm from '../../../components/VoucherForm';
import { API_BASE } from '../../../lib/api';

export default function ManualVoucherPage() {
  return (
    <div className="grid">
      <div className="page-hero card">
        <div>
          <h1>일반 전표 입력</h1>
          <p className="muted">주간 헌금 입력과 분리해서, 일반 수입/지출 전표는 여기서 따로 입력하면 돼.</p>
        </div>
        <ExportButtons items={[{ label: '전체 전표 엑셀 다운로드', href: `${API_BASE}/exports/vouchers.xlsx` }]} />
      </div>

      <VoucherForm />
    </div>
  );
}
