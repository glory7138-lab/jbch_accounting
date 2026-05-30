'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useYear } from '../lib/YearContext';

const items = [
  { href: '/', label: '대시보드', match: (pathname) => pathname === '/' },
  { href: '/offerings', label: '헌금현황', match: (pathname) => pathname.startsWith('/offerings') },
  { href: '/ledger', label: '회계장부', match: (pathname) => pathname.startsWith('/ledger') },
  { href: '/settlement', label: '월말결산', match: (pathname) => pathname.startsWith('/settlement') },
  { href: '/vouchers/manual', label: '전표입력', match: (pathname) => pathname === '/vouchers/manual' },
  { href: '/ai', label: 'AI 분류', match: (pathname) => pathname === '/ai' },
  { href: '/imports', label: '엑셀 분석/가져오기', match: (pathname) => pathname === '/imports' },
];

export default function Nav() {
  const pathname = usePathname();
  const { year, setYear } = useYear();

  return (
    <nav className="nav">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div className="nav__brand">AccountingApp</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600 }}>조회 연도:</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              background: '#1f2937',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="2025">2025년</option>
            <option value="2026">2026년</option>
            <option value="2027">2027년</option>
          </select>
        </div>
      </div>
      <div className="nav__links">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={item.match(pathname) ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
