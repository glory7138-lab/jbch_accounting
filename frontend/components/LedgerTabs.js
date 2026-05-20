'use client';

import SectionTabs from './SectionTabs';
import { ledgerMenuItems } from '../lib/appMenus';

export default function LedgerTabs() {
  const items = ledgerMenuItems.map((item) => ({
    href: item.slug === 'account-codes' ? '/ledger/account-codes' : `/ledger/${item.slug}`,
    label: item.label,
    matchMode: 'exact',
  }));

  return <SectionTabs title="회계장부" items={items} />;
}
