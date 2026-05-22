export const offeringMenuItems = [
  { href: '/offerings/weekly', label: '주간헌금현황', matchMode: 'prefix' },
  { href: '/offerings/cumulative', label: '주간헌금현황 누계', matchMode: 'exact' },
  { href: '/offerings/department-counts', label: '회별 참여자 수', matchMode: 'exact' },
  { href: '/offerings/department-amounts', label: '회별 참여금액', matchMode: 'exact' },
  { href: '/offerings/envelopes', label: '헌금봉투 번호', matchMode: 'exact' },
  { href: '/offerings/individual', label: '개인별 헌금 내역', matchMode: 'exact' },
];

export const ledgerMenuItems = [
  { slug: 'integrated', label: '통합계정', name: '통합계정' },
  { slug: 'general', label: '일반계정', name: '일반계정' },
  { slug: 'school-support', label: '교회학교후원회비', name: '교회학교후원회비' },
  { slug: 'love-offering', label: '사랑의 헌금', name: '사랑의헌금' },
  { slug: 'mission-fee', label: '선교회비', name: '선교회비' },
  { slug: 'building', label: '건축계정', name: '건축계정' },
  { slug: 'elevator', label: '승강기계정', name: '승강기계정' },
  { slug: 'overseas', label: '해외후원', name: '해외후원' },
  { slug: 'domestic-mission', label: '국내선교', name: '국내선교' },
  { slug: 'account-codes', label: '계정코드', name: '계정코드' },
];

export const settlementMenuItems = [
  { href: '/settlement/form', label: '결산양식', matchMode: 'exact' },
  { href: '/settlement/participation', label: '참여현황 및 주요관리항목 지출', matchMode: 'exact' },
  { href: '/settlement/weekly-report', label: '주간보고자료', matchMode: 'exact' },
];
