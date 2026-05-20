import WeeklyOfferingForm from '../../../components/WeeklyOfferingForm';

export default function WeeklyOfferingPage({ params }) {
  const voucherDate = params?.voucherDate;

  return (
    <div className="grid">
      <div className="page-hero card">
        <div>
          <h1>주간 헌금 등록</h1>
          <p className="muted">기준 날짜별로 저장 상태를 불러오고, 다른 헌금자로 넘어갈 때 자동 저장되도록 바꿨어.</p>
        </div>
        <div className="hero-tips">
          <div><strong>추천 흐름</strong></div>
          <div>1. 날짜 선택</div>
          <div>2. 봉투번호 또는 이름 일부 입력</div>
          <div>3. 다른 사람 행으로 이동하면 자동 저장</div>
        </div>
      </div>

      <WeeklyOfferingForm voucherDate={voucherDate} />
    </div>
  );
}
