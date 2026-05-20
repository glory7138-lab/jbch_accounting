'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function isActive(pathname, item) {
  if (item.matchMode === 'prefix') {
    return pathname.startsWith(item.href);
  }
  return pathname === item.href;
}

export default function SectionTabs({ title, items }) {
  const pathname = usePathname();

  return (
    <div className="card section-tabs">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="section-tabs__links">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(pathname, item) ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
