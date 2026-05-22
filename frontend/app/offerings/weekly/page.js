'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WeeklyOfferingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const savedDate = sessionStorage.getItem('last_weekly_date');
    const targetDate = savedDate || today;
    router.replace(`/offerings/weekly/${targetDate}`);
  }, [router]);

  return (
    <div className="card">
      <p className="muted">주간 헌금 화면으로 이동 중...</p>
    </div>
  );
}

