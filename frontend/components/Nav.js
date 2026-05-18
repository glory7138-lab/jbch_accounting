'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: '대시보드' },
  { href: '/vouchers', label: '전표 관리' },
  { href: '/ai', label: 'AI 분류' },
  { href: '/imports', label: '엑셀 분석/가져오기' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <div className="nav__brand">AccountingApp</div>
      <div className="nav__links">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
