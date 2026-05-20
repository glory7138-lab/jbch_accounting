'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SectionTabs({ title, items }) {
  const pathname = usePathname();

  return (
    <div className="card section-tabs">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="section-tabs__links">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={item.match(pathname) ? 'active' : ''}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
