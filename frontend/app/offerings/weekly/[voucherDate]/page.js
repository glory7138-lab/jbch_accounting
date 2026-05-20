import ExportButtons from '../../../../components/ExportButtons';
import SectionTabs from '../../../../components/SectionTabs';
import WeeklyOfferingForm from '../../../../components/WeeklyOfferingForm';
import { offeringMenuItems } from '../../../../lib/appMenus';
import { API_BASE } from '../../../../lib/api';

export default function WeeklyOfferingPage({ params }) {
  const voucherDate = params?.voucherDate;

  return (
    <div className="grid">
      <SectionTabs title="헌금현황" items={offeringMenuItems} />
      <div className="page-hero card">
        <div>
          <h2>주간헌금현황</h2>
          <p className="muted">기준 날짜별 입력, 자동 저장, 날짜별 재조회, 엑셀 다운로드를 여기서 처리해.</p>
        </div>
        <ExportButtons
          items={[
            { label: '현재 화면 엑셀 다운로드', href: `${API_BASE}/vouchers/weekly-offering.xlsx?voucherDate=${voucherDate}` },
          ]}
        />
      </div>
      <WeeklyOfferingForm voucherDate={voucherDate} />
    </div>
  );
}
