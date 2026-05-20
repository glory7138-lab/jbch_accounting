'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: '대시보드', match: (pathname) => pathname === '/' },
  { href: '/vouchers', label: '주간 헌금', match: (pathname) => pathname === '/vouchers' || pathname.startsWith('/vouchers/') && !pathname.startsWith('/vouchers/manual') },
  { href: '/vouchers/manual', label: '전표 입력', match: (pathname) => pathname === '/vouchers/manual' },
  { href: '/ai', label: 'AI 분류', match: (pathname) => pathname === '/ai' },
  { href: '/imports', label: '엑셀 분석/가져오기', match: (pathname) => pathname === '/imports' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <div className="nav__brand">AccountingApp</div>
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
